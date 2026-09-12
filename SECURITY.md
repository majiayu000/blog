# Security Policy

## Supported versions

This repository builds a single live site. Only the current `main` branch is
supported; there are no released versions to patch.

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/majiayu000/blog/security/advisories/new).

Do not open a public issue for a security problem.

Expect an initial response within about a week. If the report is confirmed, the
fix ships to `main` and the advisory is published once the site is redeployed.

## Scope

In scope: the build tooling, templates, and anything that could inject content
into the published site.

Out of scope: findings that require access to the maintainer's Cloudflare or
GitHub account, and reports about the content of blog posts themselves.

## `/api/event` threat model

`functions/api/event.js` is a **public-write** analytics beacon. The
`Origin` / `Referer` same-origin check only reduces naive browser CSRF. Those
headers are attacker-controlled on non-browser clients and are **not**
authentication.

The handler validates event names, body size, and a strict `path` / `slug`
shape (`/[a-z0-9/_-]*` and `[a-z0-9_-]*`). It does not prove the caller is a
real browser or that `path` exists on the site.

Deploy-time controls (recommended in the Cloudflare dashboard, not assertable
in unit tests):

- Rate limiting on `POST /api/event` (e.g. per IP)
- WAF / bot score rules for the same path

Stronger authenticity (Turnstile, signed beacons) is out of scope unless the
maintainer asks for it.
