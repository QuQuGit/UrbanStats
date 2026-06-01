# Auth Testing Playbook (Football 5v5 Stats Platform)

Read this before testing auth-gated pages.

## Step 1: Create Test User & Session (MongoDB)
```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Step 2: Test Backend API
```bash
# Test auth endpoint
curl -X GET "$URL/api/auth/me" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"

# Players
curl -X GET "$URL/api/players" -H "Authorization: Bearer YOUR_SESSION_TOKEN"
curl -X POST "$URL/api/players" -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Alice"}'

# Matches
curl -X GET "$URL/api/matches" -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

## Step 3: Browser Testing
```python
await page.context.add_cookies([{
    "name": "session_token",
    "value": "YOUR_SESSION_TOKEN",
    "domain": "your-app.com",
    "path": "/",
    "httpOnly": True,
    "secure": True,
    "sameSite": "None"
}])
await page.goto("https://your-app.com")
```

## Success Indicators
- `/api/auth/me` returns user data
- Dashboard loads without redirect
- Players/Matches CRUD operations work
