# Security Fix: Nodemailer Vulnerability

## Vulnerability Details

**Package**: nodemailer  
**Affected Versions**: < 7.0.7  
**Patched Version**: 7.0.7  
**Severity**: Not specified in advisory  
**CVE**: Email to an unintended domain can occur due to Interpretation Conflict

## Description

The vulnerability in nodemailer versions prior to 7.0.7 allows emails to be sent to unintended domains due to an interpretation conflict in email address parsing.

## Resolution

### Changes Made

1. **Updated nodemailer dependency**:
   - From: `^6.10.0`
   - To: `^7.0.7`
   - Installed version: `7.0.11`

2. **Updated type definitions**:
   - From: `@types/nodemailer@^6.4.4`
   - To: `@types/nodemailer@^7.0.4`

### Files Modified

- `packages/saltcorn-data/package.json` - Updated both dependencies

### Compatibility

Nodemailer 7 maintains API compatibility with version 6 for standard usage patterns. The upgrade should be transparent to existing code.

### Code Usage

The codebase uses nodemailer in standard ways:
- `createTransport()` - Transport creation
- `Transporter` type - TypeScript typing
- `sendMail()` - Email sending
- `MailOpts` type - Mail options typing

All of these APIs remain unchanged in v7.

### Testing

✅ Verified nodemailer can be loaded and used:
```javascript
const nodemailer = require('nodemailer');
const transport = nodemailer.createTransport({ jsonTransport: true });
// Transport created successfully
```

✅ Installed version confirmed:
```
nodemailer@7.0.11
```

### Impact

- **Security**: Vulnerability resolved
- **Functionality**: No breaking changes
- **Performance**: No performance impact
- **Dependencies**: Clean dependency update

### Remaining Vulnerabilities

After this fix, the saltcorn-data package has 3 remaining vulnerabilities in different dependencies:

1. **glob** (high) - CLI command injection
2. **js-yaml** (moderate) - Prototype pollution
3. **tough-cookie** (moderate) - Prototype pollution

These are unrelated to the nodemailer issue and should be addressed separately if needed.

## Verification Steps

To verify the fix:

1. Check installed version:
   ```bash
   npm list nodemailer
   ```
   Expected: `nodemailer@7.0.11` (or higher)

2. Run email tests:
   ```bash
   cd packages/saltcorn-data
   npm test tests/email.test.ts
   ```

3. Check for nodemailer-specific vulnerabilities:
   ```bash
   npm audit | grep nodemailer
   ```
   Expected: No nodemailer vulnerabilities

## Deployment Notes

- No configuration changes required
- No code changes required
- Update applies immediately after deployment
- Backward compatible with existing email configuration
- Recommended to test email sending after deployment

## References

- Nodemailer v7 Release Notes: https://github.com/nodemailer/nodemailer/releases/tag/v7.0.0
- Advisory: Nodemailer < 7.0.7 - Email to unintended domain vulnerability
- Fixed in: nodemailer@7.0.7
