"""Transport + signing helpers; no invented Haraj endpoints/consent fields."""
import hashlib
import hmac
import json
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

class ProviderStopped(RuntimeError):
    pass

class PacedJSON:
    def __init__(self, allowed_hosts, interval_seconds=3, sleep=time.sleep, clock=time.monotonic):
        self.allowed_hosts = set(allowed_hosts)
        self.interval = max(1, interval_seconds)
        self.sleep, self.clock, self.next_at = sleep, clock, 0
        self.opener = build_opener(NoRedirect())

    def request(self, url, payload=None, token=None, retry_safe=False, deadline=None):
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or parsed.hostname not in self.allowed_hosts or parsed.username or parsed.password or parsed.port not in (None,443):
            raise ValueError('Unapproved endpoint')
        for attempt in range(3 if retry_safe else 1):
            wait = max(0, self.next_at - self.clock())
            if deadline is not None and self.clock() + wait >= deadline:
                raise TimeoutError('Campaign time allowance reached')
            self.sleep(wait)
            self.next_at = self.clock() + self.interval
            headers = {'Content-Type':'application/json'}
            if token:
                headers['Authorization'] = 'Bearer ' + token
            request = Request(url, data=None if payload is None else json.dumps(payload).encode(), headers=headers)
            timeout = 15 if deadline is None else min(15,max(.1,deadline-self.clock()))
            try:
                with self.opener.open(request,timeout=timeout) as response:
                    raw=response.read(2_000_001)
                    if len(raw)>2_000_000:
                        raise ProviderStopped('Response size limit')
                    return json.loads(raw)
            except HTTPError as error:
                if error.code in (401,403):
                    raise ProviderStopped(f'Provider access rejected ({error.code})') from None
                if error.code == 429:
                    value=error.headers.get('Retry-After','')
                    try:
                        backoff=max(0,float(value))
                    except ValueError:
                        try:
                            backoff=max(0,(parsedate_to_datetime(value)-datetime.now(timezone.utc)).total_seconds())
                        except (ValueError,TypeError):
                            backoff=60
                    self.next_at=max(self.next_at,self.clock()+backoff)
                    # Persist next_at as a wall-clock timestamp in the shared
                    # provider gate; all workers must honor it, including restart.
                    raise ProviderStopped('Provider rate limited; honor Retry-After') from None
                if not retry_safe or error.code<500 or attempt==2:
                    raise ProviderStopped(f'Provider request failed ({error.code})') from None
                self.next_at=max(self.next_at,self.clock()+2**attempt)

def signed_event_headers(secret, issuer, body, timestamp=None):
    """Call only inside a trusted identity/OTP-verification service.

    This function signs a completed verification receipt; it does NOT verify
    identity or create permission. Never expose it as a public signing API.
    The body must have come from the subject-confirmation workflow, never an
    administrator filling in a desired authorization.
    """
    if len(secret)<32 or body.get('issuer')!=issuer:
        raise ValueError('Invalid verifier configuration')
    timestamp=str(int(time.time()) if timestamp is None else timestamp)
    canonical=json.dumps(body,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False)
    content=f"{timestamp}.{body['event_id']}.{canonical}".encode()
    signature=hmac.new(secret.encode(),content,hashlib.sha256).hexdigest()
    return {'x-consent-timestamp':timestamp,'x-consent-event-id':body['event_id'],'x-consent-signature':'sha256='+signature}
