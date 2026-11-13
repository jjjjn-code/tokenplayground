/**
 * Simulated developer edits for testing pull (phase 4), based on the drift
 * cases in the PRD. Used by the tests, by demo mode and to set up the
 * sandbox's release branch.
 *
 *   01 red-700 has the wrong value in code (#FF3737).
 *   02 orange-700-aa is missing from code.
 *   03 line-inverse, line-disabled and line-danger are missing from code.
 *   04 line-default is written --line-default instead of --color-line-default.
 *   05 --color-hover and --color-active exist only in code.
 *   Extra: button-surface-primary-hover has a raw value instead of its reference.
 */
export function simulateDeveloperDrift(files: Record<string, string>): Record<string, string> {
  const out = { ...files };
  const colors = out["styles/colors.css"];
  if (colors !== undefined) {
    out["styles/colors.css"] = colors
      .replace("--color-red-700: #A80000;", "--color-red-700: #FF3737;")
      .split("\n")
      .filter((l) => !/--color-(orange-700-aa|line-inverse|line-disabled|line-danger):/.test(l))
      .join("\n")
      .replace(/--color-line-default:/g, "--line-default:")
      .replace(/(@theme \{\n(?:.*\n)*?)(\})/, (_m, body: string, close: string) => `${body}  --color-hover: var(--color-orange-700);\n  --color-active: var(--color-orange-400);\n${close}`);
  }
  const button = out["components/button/button.css"];
  if (button !== undefined) {
    out["components/button/button.css"] = button.replace(
      /(\.button \{\n(?:.*\n)*?\s*--button-surface-primary-hover: )var\(--color-orange-700-aa\);/,
      "$1#D33704;",
    );
  }
  return out;
}
