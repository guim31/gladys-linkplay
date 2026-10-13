# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles, for reviewers:

- **Stored data**: nothing in `/data`. The configuration (player addresses,
  language) is kept by Gladys; the integration holds no password, token or
  key — the LinkPlay HTTP API has none.
- **Network**: plain HTTP or HTTPS requests to the players of the local
  network only (`/httpapi.asp`), never to the Internet. The players' HTTPS
  certificates are self-signed: they are accepted without verification, for
  these requests only. The addresses come from the mediated mDNS and SSDP
  discovery of Gladys, from the configuration, and from the group leaders;
  every SSDP responder is asked one read-only status command before being
  kept or ignored.
- **Logs**: the URL of an announcement (the text-to-speech MP3 of Gladys
  Plus, which carries a token) is never logged whole: only its scheme, host
  and path.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the players and their firmware (report those to LinkPlay or to the maker
of the player).
