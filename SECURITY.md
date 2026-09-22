# Security Policy

## Reporting a vulnerability

Please do not open a public issue for suspected vulnerabilities or exposed credentials.
Use GitHub's private vulnerability reporting feature under the repository's **Security** tab instead.

Include the affected route or component, reproduction steps, expected impact, and any suggested mitigation. Reports will be acknowledged as soon as possible.

## Secrets

Real credentials must never be committed. Local development values belong in `.env`, using `.env.example` only as a reference. If a secret is exposed, revoke it first and then remove it from every reachable Git revision.
