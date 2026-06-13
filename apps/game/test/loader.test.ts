import { describe, expect, it } from "vitest";
import type { ScriptCollection, ScriptCommand } from "@eb/schemas";
import { buildDialogueForReference } from "../src/loader";

const file = "ccscript/alpha.ccs";
const sourceLocation = { file, line: 1, column: 1 };

function command(command: ScriptCommand): ScriptCommand {
  return command;
}

function syntheticScripts(): ScriptCollection {
  const commands: ScriptCommand[] = [
    command({ cmd: "label", name: "start", raw: "start:", sourceLocation }),
    command({ cmd: "control", code: "goto", target: "target", raw: "goto(target)", sourceLocation }),
    command({
      cmd: "text",
      value: "Skipped synthetic text.",
      segments: [{ kind: "text", value: "Skipped synthetic text." }],
      raw: "\"Skipped synthetic text.\"",
      sourceLocation
    }),
    command({ cmd: "end", raw: "end", sourceLocation }),
    command({ cmd: "label", name: "target", raw: "target:", sourceLocation }),
    command({
      cmd: "text",
      value: "Resolved synthetic text.",
      segments: [{ kind: "text", value: "Resolved synthetic text." }],
      raw: "\"Resolved synthetic text.\"",
      sourceLocation
    }),
    command({ cmd: "end", raw: "end", sourceLocation })
  ];

  return {
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    files: [{
      path: file,
      commands,
      labels: ["start", "target"],
      counts: {
        commands: commands.length,
        labels: 2,
        textCommands: 2,
        unknownCommands: 0
      },
      warnings: []
    }],
    counts: {
      files: 1,
      commands: commands.length,
      labels: 2,
      textCommands: 2,
      unknownCommands: 0
    },
    warnings: []
  };
}

describe("buildDialogueForReference", () => {
  it("uses flow resolution for dialogue references", () => {
    const pages = buildDialogueForReference(syntheticScripts(), "alpha.start");

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      text: "Resolved synthetic text.",
      ended: true
    });
  });
});
