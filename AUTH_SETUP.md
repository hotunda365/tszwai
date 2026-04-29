# Email Authentication Setup

This guide explains the new email login and confirmation system added to the application.

## Features Added

### 1. **Email Sign Up**
- Users can create accounts with email and password
- Passwords are hashed using SHA256
- Confirmation tokens are generated and expire in 24 hours
- Email confirmation link is logged to console (ready for email service integration)

### 2. **Email Confirmation**
- Users receive a confirmation link in their email
- Clicking the link confirms their email address
- Users cannot log in until their email is confirmed

### 3. **Email Login**
- Users can log in with confirmed email and password
- Session tokens are created and stored (30-day expiry)
- Logout functionality is available via the settings menu

### 4. **Protected Pages**
- The chat page is protected and requires authentication
- Unauthenticated users are redirected to the login page

## Database Setup

Run the SQL schema to create the necessary tables:

```bash
# Execute the SQL in your Supabase dashboard
cat database-schema.sql
```

This creates:
- **users** table - stores user accounts with confirmation tokens
- **sessions** table - stores active user sessions
- Indexes for efficient queries
- Row Level Security policies

## API Endpoints

### Sign Up
```
POST /api/auth/signup
Body: { email: string, password: string }
Response: { message: string, userId: string }
```

### Login
```
POST /api/auth/login
Body: { email: string, password: string }
Response: { message: string, userId: string, email: string }
```

### Confirm Email
```
POST /api/auth/confirm
Body: { token: string }
Response: { message: string, email: string }
```

### Check Auth Status
```
GET /api/auth/me
Response: { user: { id: string, email: string } }
```

### Logout
```
POST /api/auth/logout
Response: { message: string }
```

## File Structure

- `app/login/page.tsx` - Login/Signup page
- `app/confirm-email/page.tsx` - Email confirmation page
- `app/api/auth/signup/route.ts` - Sign up endpoint
- `app/api/auth/login/route.ts` - Login endpoint
- `app/api/auth/confirm/route.ts` - Email confirmation endpoint
- `app/api/auth/me/route.ts` - Auth status check
- `app/api/auth/logout/route.ts` - Logout endpoint
- `lib/auth-context.tsx` - Authentication context provider
- `lib/protected-page.tsx` - Protected page wrapper component

## Integration Checklist

- [ ] Execute `database-schema.sql` in Supabase dashboard
- [ ] Add NEXT_PUBLIC_APP_URL to `.env.local` (e.g., http://localhost:3000)
- [ ] Integrate email service (Resend, SendGrid, etc.) to send confirmation emails
- [ ] Update the confirmation email template with the token link
- [ ] Test signup, confirmation, and login flows
- [ ] Update Supabase Row Level Security policies if needed

## Security Notes

- Passwords are hashed using SHA256 (consider using bcrypt in production)
- Session tokens are HttpOnly cookies with 30-day expiry
- Confirmation tokens expire in 24 hours
- Row Level Security policies protect user data
- Sensitive operations check session validity

## Next Steps

1. **Email Service Integration**: Replace console.log with actual email sending (Resend, SendGrid, etc.)
2. **Password Reset**: Add forgot password functionality
3. **OAuth Integration**: Add Google/GitHub login options
4. **2FA**: Implement two-factor authentication
5. **Account Management**: Add profile update, password change features
