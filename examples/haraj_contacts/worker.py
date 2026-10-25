"""Reference worker. Source adapters must use approved provider access.

No network scraping or personal-phone bypass is included. The source is injected
because no official Haraj permission-signal contract was verified. DB storage
uses psycopg v3; encrypt() must use your KMS/encryption service, not plaintext.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import re
import uuid
from typing import Protocol

ACTIONS = {'lookup', 'save', 'reveal', 'download', 'call'}

def normalize_phone(value):
    value = str(value).translate(str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'))
    value = re.sub(r'\D', '', value)
    if value.startswith('00966'):
        value = value[2:]
    if re.fullmatch(r'05\d{8}', value):
        value = '966' + value[1:]
    return '+' + value if re.fullmatch(r'9665\d{8}', value) else None

def phone_hash(phone):
    return hashlib.sha256(('haraj:' + phone).encode()).hexdigest()

@dataclass(frozen=True)
class Decision:
    allowed: bool
    status: str
    basis: str = ''
    evidence_id: str = ''

@dataclass(frozen=True)
class Listing:
    id: str
    author_id: str
    title: str
    body: str  # Adapter must strip phone-like strings from candidate metadata.

@dataclass(frozen=True)
class Contact:
    author_id: str
    phone: str

class Source(Protocol):
    def metadata_batches(self):
        """Yield metadata-only listings using durable, documented cursors."""
    def published_business_contacts(self, listing):
        """Return only contacts with independently verified business evidence.

        Business-publication rows must already have been recorded by the trusted
        evidence service. Never implement this by harvesting commenter numbers.
        """
    def authorized_contacts(self, listing):
        """Phone-bearing provider request; caller has passed lookup permission."""

class Policy:
    def __init__(self, conn):
        self.conn = conn

    def authorize(self, workspace, subject, action, phone=None):
        if action not in ACTIONS:
            return Decision(False, 'invalid_action')
        # Use this same lock key in the write-side revocation adapter.
        self.conn.execute('SELECT pg_advisory_xact_lock_shared(hashtextextended(%s,0))',
                          (f'haraj-consent:{workspace}:{subject}',))
        if self.conn.execute('SELECT 1 FROM haraj_contact_suppressions WHERE organization_id=%s AND author_id=%s',
                             (workspace, subject)).fetchone():
            return Decision(False, 'revoked')
        digest = phone_hash(phone) if phone else None
        if action in {'save', 'reveal', 'download'} and digest:
            row = self.conn.execute('''SELECT id FROM haraj_business_publications
              WHERE organization_id=%s AND author_id=%s AND phone_hash=%s
              AND revoked_at IS NULL AND observed_at<=now() AND expires_at>now()
              ORDER BY observed_at DESC LIMIT 1''', (workspace, subject, digest)).fetchone()
            if row:
                return Decision(True, 'public_business_directory', 'business_publication', str(row[0]))
        # These rows are created by the existing signed first-party verifier,
        # never by this worker or a customer-supplied "consent=true" flag.
        rows = self.conn.execute('''SELECT id,actions,phone_hashes FROM wasla_contact_authorizations
          WHERE organization_id=%s AND author_id=%s AND provider='haraj'
          AND purpose='lead_generation' AND status='granted' AND revoked_at IS NULL
          AND policy_version>=2 AND verified_at<=now() AND granted_at<=now()
          AND expires_at>now() AND length(trim(evidence_reference))>0
          AND length(trim(verified_by))>0 ORDER BY verified_at DESC''', (workspace, subject)).fetchall()
        for identity, actions, hashes in rows:
            if hashes and (action in actions or action == 'lookup' and 'save' in actions):
                if action == 'lookup' or digest in hashes:
                    return Decision(True, 'authorized', 'verified_grant', str(identity))
        return Decision(False, 'permission_required' if not rows else 'scope_or_phone_not_covered')

def collect_listing(conn, source, workspace, listing, encrypt):
    """One listing, current authorization at request and commit boundaries.

    Business evidence and personal grants are distinct. No raw personal phone
    is written to candidate caches, logs or denied outcomes.
    """
    policy = Policy(conn)
    contacts = list(source.published_business_contacts(listing))
    if not contacts:
        with conn.transaction():
            lookup = policy.authorize(workspace, listing.author_id, 'lookup')
        if not lookup.allowed:
            return Decision(False, lookup.status)
        contacts = list(source.authorized_contacts(listing))
    if not contacts:
        return Decision(False, 'missing_phone')
    last = Decision(False, 'missing_phone')
    for item in contacts:
        if str(item.author_id) != str(listing.author_id):
            last = Decision(False, 'ownership_mismatch'); continue
        phone = normalize_phone(item.phone)
        if not phone:
            last = Decision(False, 'invalid_saudi_mobile'); continue
        with conn.transaction():
            # Fresh DB read + subject lock serialize save with withdrawal.
            permission = policy.authorize(workspace, listing.author_id, 'save', phone)
            if not permission.allowed:
                last = permission; continue
            encrypted = encrypt(phone)
            saved = conn.execute('''INSERT INTO haraj_authorized_contacts
              (id,organization_id,author_id,phone_hash,phone_ciphertext,basis,evidence_id)
              VALUES(%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(organization_id,phone_hash)
              DO NOTHING RETURNING id''', (uuid.uuid4(), workspace, listing.author_id,
              phone_hash(phone), encrypted, permission.basis, permission.evidence_id)).fetchone()
            last = Decision(bool(saved), 'saved' if saved else 'duplicate', permission.basis, permission.evidence_id)
            if saved:
                return last
    return last

def run_batch(conn, source, workspace, target, matches, encrypt, stopped=lambda: False):
    delivered = 0
    for batch in source.metadata_batches():
        for listing in batch:
            if stopped() or delivered >= target:
                return delivered
            if not matches(listing):
                continue
            result = collect_listing(conn, source, workspace, listing, encrypt)
            with conn.transaction():
                conn.execute('''INSERT INTO haraj_collection_outcomes
                  (id,organization_id,author_id,listing_id,status,detail)
                  VALUES(%s,%s,%s,%s,%s,%s)''', (uuid.uuid4(), workspace, listing.author_id,
                  listing.id, result.status, result.basis or result.status))
            delivered += int(result.status == 'saved')
    return delivered

def revoke(conn, workspace, subject, reason='subject_withdrawal'):
    with conn.transaction():
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',
                     (f'haraj-consent:{workspace}:{subject}',))
        conn.execute('''INSERT INTO haraj_contact_suppressions(organization_id,author_id,reason)
          VALUES(%s,%s,%s) ON CONFLICT(organization_id,author_id) DO NOTHING''', (workspace,subject,reason))
        conn.execute("UPDATE wasla_contact_authorizations SET status='revoked',revoked_at=now() WHERE organization_id=%s AND author_id=%s AND provider='haraj'", (workspace,subject))
        conn.execute('UPDATE haraj_business_publications SET revoked_at=now() WHERE organization_id=%s AND author_id=%s', (workspace,subject))
    # Every reveal/download/call must call Policy.authorize again; a previously
    # paid reveal or decrypted cache must never skip this check.
