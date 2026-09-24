# Security policy

Deathspot UG protects people who report where violence happens. A vulnerability here can put reporters at risk, so we treat security reports as a priority.

## Reporting a vulnerability

**Please don't open a public issue.** Report privately through GitHub:

1. Go to the [Security tab](https://github.com/mwanjajoel/deathspot/security) of this repository.
2. Click **Report a vulnerability** and describe the issue, how to reproduce it, and its impact.

We aim to acknowledge reports within 3 days and to share a fix plan within 14 days. We'll credit you in the advisory unless you'd rather stay anonymous.

## What we especially care about

- Anything that could **identify reporters or voters**: IP addresses, device details, or linking reports to people
- Bypassing **moderation**: publishing content without approval, or editing or deleting spots without a moderator role
- Weaknesses in **row-level security** or access to data through the API that should be private
- Bypassing **rate limits** at scale, or ways to flood the map with fake reports
- Authentication issues in the **admin panel**
- Secrets exposed in the repository, the deployed site or the docs

## Out of scope

- Denial of service by sheer traffic volume
- Reports from automated scanners without a demonstrated impact
- Missing security headers without an exploit
- Issues in third-party services we use (OpenStreetMap, OSRM, Cloudflare): please report those to them

## Supported versions

Only the current `main` branch, deployed at [deathspot.org](https://deathspot.org), receives security fixes.

## If you're in danger

This project can't respond to emergencies. In Uganda, call **999** or **112**.
