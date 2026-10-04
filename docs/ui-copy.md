# UI copy

Write for operators: what happened, what they can do next, and what their data means.
Avoid framework/version/cache/API terminology in screens. Diagnostic detail belongs in logs.

Data status is useful when it changes a decision. Decorative uptime, version, beta and
always-green badges consume attention without helping work.

Error text explains recovery; never expose a stack trace. Empty/search/error causes must use
different messages. Native packaging options are developer configuration, not operator UI.
See [UI states](ui-states.md) for concrete feedback components.
