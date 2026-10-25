// Expose actionable operational failures, never arbitrary 5xx/SQL errors.
export function harajPublicError(error){
  if(!['HARAJ_SAFETY_PAUSED','HARAJ_REQUEST_FAILED','HARAJ_SAFETY_UNAVAILABLE'].includes(error?.code))return null;
  const text=String(error.message||'');
  let message='The lead-search connection is temporarily unavailable. Saved results are kept.';
  if(text.includes('interrupted_request_review_required'))message='A previous search was interrupted and left a request lock. An administrator must recover the connection before a new search can start.';
  else if(text.includes('daily_request_budget_reached'))message='The workspace’s daily search-request budget has been reached. Ask an administrator to review the budget.';
  else if(text.includes('access_restricted')||text.includes('authentication_rejected'))message='The provider rejected access. An administrator must review the authorized connection.';
  else if(text.includes('rate_limited'))message='The provider has rate-limited requests. Wait for its retry period before continuing.';
  else if(error.code==='HARAJ_REQUEST_FAILED')message='The search request failed temporarily. Saved results are kept; retry after the connection recovers.';
  return {status:503,code:error.code,message};
}
