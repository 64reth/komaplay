# Stability interaction matrix

| Route group                                                    | Controls                                                        | Status                                                                       | Coverage              |
| -------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------- |
| `/`, `/issues/*`, `/archive`, `/search`                        | shared navigation, issue/filter controls, feature cards, strips | Works; unavailable results show empty copy                                   | unit + signed-out E2E |
| `/features/*`                                                  | Community Edition links, citations, Workshop CTA                | Works; Workshop is feature-scoped                                            | unit + E2E            |
| `/features/*/workshop`                                         | sign-in/create-account, return link, contribution controls      | Signed-out actions are explicit; member controls require verified membership | unit + E2E            |
| `/onboarding`, `/handbook`                                     | field guide, return links, sign-out escape                      | Required flow blocks background; standalone route has no duplicate modal     | unit                  |
| `/profile`, `/profile/settings`                                | account menu, profile/settings/publication navigation           | Server-protected; one Link navigation per menu destination                   | unit                  |
| `/editorial`, `/moderation`, `/publishing`, `/handbook/manage` | privileged tools                                                | Disabled by server capability boundaries with access messaging               | unit                  |

Interactive integrations that require configured external state display a recoverable configuration or session message rather than a silent action. Production smoke testing is read-only and must not submit contributions or moderation actions.
