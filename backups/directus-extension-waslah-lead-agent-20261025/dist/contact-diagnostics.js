const increment=(counts,key)=>{counts[key]=Number(counts[key]||0)+1;};
export function recordContactAuthorization(diagnostics,decision,{lookup=false,successfulLookup=false}={}){
  // A successful response is an outcome of an existing decision, not a second
  // authorization decision. Keep those denominators separate.
  if(successfulLookup){diagnostics.successfulAuthorizedLookups=Number(diagnostics.successfulAuthorizedLookups||0)+1;return;}
  diagnostics.decisionsByReason ||= {};
  diagnostics.providerDecisionsByReason ||= {};
  diagnostics.individualConsentByReason ||= {};
  increment(diagnostics.decisionsByReason,decision?.allowed?(decision.basis||decision.status||'authorized'):(decision?.detail||'not_authorized'));
  if(decision?.providerAuthorization?.detail)increment(diagnostics.providerDecisionsByReason,decision.providerAuthorization.detail);
  if(decision?.individualConsent?.detail)increment(diagnostics.individualConsentByReason,decision.individualConsent.detail);
  if(lookup&&decision?.allowed)diagnostics.eligiblePhoneLookups=Number(diagnostics.eligiblePhoneLookups||0)+1;
}
export function recordContactApiFailure(diagnostics,error){
  diagnostics.apiFailuresByReason ||= {};
  const status=Number(error?.status||0);
  const knownCode=/^HARAJ_[A-Z_]{1,64}$/.test(error?.code||'')||['UNAUTHENTICATED','FORBIDDEN','RATE_LIMITED','INTERNAL_SERVER_ERROR'].includes(error?.code);
  const reason=status>=400&&status<=599?`http_${status}`:knownCode?error.code:'contact_api_failure';
  increment(diagnostics.apiFailuresByReason,reason);
  return reason;
}
