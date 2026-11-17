# Bite & Brew GitHub handoff

Repository: https://github.com/rainnierlloydg-debug/Bite-Brew.git

Git checkout: `.bootstrap-temp/bite-brew-github`.

| Branch | Commit | Author | Scope |
| --- | --- | --- | --- |
| main | a9897b3 | Zyreen-uni | Integrated application containing all three contributions |
| rainnier-branch | 29886fc | rainnierlloydg-debug | Backend APIs, schema, services, scripts and tests |
| macky-branch | 667dfc8 | mackymagbanua33-source | Storefront, staff interface, styles and public assets |
| zyreen-branch | 5c78d41 | Zyreen-uni | Project setup, package configuration and documentation |

Commit emails: Rainnier `rainnierlloydg@gmail.com`; Macky `mackymagbanua33@gmail.com`; Zyreen `castillomzyreenmae@gmail.com`.

The three original branches were successfully pushed according to local push records. Local branch names have now been updated to the requested contributor names. Publishing the new names and removing the old backend/frontend names remains pending: the agent cannot connect to github.com:443.

Run from the original workspace root in the user terminal:

```powershell
git -C .bootstrap-temp/bite-brew-github push --atomic -u origin main rainnier-branch macky-branch zyreen-branch :backend :frontend
```

This creates the named branches and deletes the old backend/frontend remote branch names atomically. It does not rewrite commits or change application files. main already includes every named contribution branch, verified with merge-base ancestry checks. The latest tracked application has 114 files. Private database records, uploads, .env files, dependencies and local artifacts are excluded.

Branch names and commit authors do not switch the authenticated GitHub account. Every contributor must authenticate personally if separate push activity is required.

The checkout passed syntax checks for 68 JavaScript files and nine calculation tests. The identical original application previously passed 35 tests and browser checks. No application files changed during branch renaming.
