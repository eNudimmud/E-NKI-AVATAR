"""E*NKI dashboard avatar plugin.

The agent-side registration is intentionally empty: the plugin talks to the
existing Hermes gateway through the sanctioned dashboard SDK and adds no tools,
hooks, commands, or privileged capabilities.
"""


def register(ctx):
    """Keep the installable Hermes plugin valid without extending the agent core."""

