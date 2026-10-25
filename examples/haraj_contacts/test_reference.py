import unittest
from worker import normalize_phone,phone_hash,Policy,Listing,Contact,collect_listing
from integration import signed_event_headers,PacedJSON

class Rows:
    def __init__(self,rows=()): self.rows=rows
    def fetchone(self): return self.rows[0] if self.rows else None
    def fetchall(self): return self.rows

class Transaction:
    def __enter__(self): return self
    def __exit__(self,*args): return False

class DB:
    def __init__(self): self.suppressed=False;self.business=False;self.grants=[];self.saved=set()
    def transaction(self): return Transaction()
    def execute(self,sql,args=()):
        if 'haraj_contact_suppressions' in sql:return Rows([(1,)] if self.suppressed else [])
        if 'FROM haraj_business_publications' in sql:return Rows([('publication',)] if self.business else [])
        if 'FROM wasla_contact_authorizations' in sql:return Rows(self.grants)
        if 'INSERT INTO haraj_authorized_contacts' in sql:
            if args[3] in self.saved:return Rows()
            self.saved.add(args[3]);return Rows([('saved',)])
        return Rows()

class Source:
    def __init__(self,contacts=()):self.contacts=contacts;self.reveals=0
    def published_business_contacts(self,listing):return self.contacts
    def authorized_contacts(self,listing):self.reveals+=1;return self.contacts

class Tests(unittest.TestCase):
    def test_digits(self):
        self.assertEqual(normalize_phone('٠٥٥٥٥٥٥٠٠١'),'+966555555001')
        self.assertEqual(normalize_phone('00966555555001'),'+966555555001')
        self.assertIsNone(normalize_phone('+14155552671'))
    def test_business_does_not_authorize_calls(self):
        db=DB();db.business=True
        self.assertTrue(Policy(db).authorize('org','12','save','+966555555001').allowed)
        self.assertFalse(Policy(db).authorize('org','12','call','+966555555001').allowed)
    def test_no_grant_no_reveal(self):
        db=DB();source=Source()
        result=collect_listing(db,source,'org',Listing('1','12','CCTV',''),lambda p:'encrypted:'+p)
        self.assertEqual(result.status,'permission_required');self.assertEqual(source.reveals,0)
    def test_ownership_and_dedup(self):
        db=DB();db.business=True
        listing=Listing('1','12','CCTV','')
        source=Source([Contact('99','0555555001')])
        self.assertEqual(collect_listing(db,source,'org',listing,lambda p:'encrypted').status,'ownership_mismatch')
        source.contacts=[Contact('12','0555555001')]
        self.assertEqual(collect_listing(db,source,'org',listing,lambda p:'encrypted').status,'saved')
        self.assertEqual(collect_listing(db,source,'org',listing,lambda p:'encrypted').status,'duplicate')
        db.suppressed=True
        self.assertEqual(collect_listing(db,source,'org',listing,lambda p:'encrypted').status,'revoked')
    def test_phone_and_action_scopes(self):
        db=DB();db.grants=[('grant',['save'],[phone_hash('+966555555001')])]
        self.assertTrue(Policy(db).authorize('org','12','lookup').allowed)
        self.assertFalse(Policy(db).authorize('org','12','save','+966555555002').allowed)
        self.assertFalse(Policy(db).authorize('org','12','call','+966555555001').allowed)
    def test_signature(self):
        body={'issuer':'fixture','event_id':'fixture-event','type':'revoke'}
        a=signed_event_headers('fixture-only-signing-secret-12345678','fixture',body,1700000000)
        b=signed_event_headers('fixture-only-signing-secret-12345678','fixture',dict(reversed(list(body.items()))),1700000000)
        self.assertEqual(a,b)
    def test_endpoint_validation(self):
        for url in ['http://haraj.com.sa/','https://evil.example/','https://token@haraj.com.sa/']:
            with self.assertRaises(ValueError):PacedJSON({'haraj.com.sa'}).request(url)

if __name__=='__main__':unittest.main()
