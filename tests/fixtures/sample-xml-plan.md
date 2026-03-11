# Sample XML Plan

<plan version="1.0">

<task id="1" status="pending">
<title>Add detection to verification skill</title>

<files>
  <file action="create" path="references/xml-plan-format.md"/>
  <file action="modify" path="skills/verify-plan-criteria/SKILL.md"/>
</files>

<criteria>
  <criterion>
    <what>XML plans are detected when plan version appears in first 50 lines</what>
    <how>detection returns XML mode for XML fixture, prose mode for prose fixture</how>
    <command>grep -q '^<plan version="1.0">' tests/fixtures/sample-xml-plan.md</command>
  </criterion>
  <criterion type="manual">XML plan renders cleanly on GitHub with no raw tag artifacts</criterion>
</criteria>

**Quality Constraints:**
- Error handling: fall back to prose parser on malformed XML
- Types: all parsed fields are strings, never undefined
- Parallelizable: yes

**Steps:**
1. Read the plan file
2. Check for XML format
3. Route to correct parser

</task>

<task id="2" status="done" commit="abc1234">
<title>Create test fixtures</title>

<files>
  <file action="create" path="tests/fixtures/sample-xml-plan.md"/>
  <file action="create" path="tests/fixtures/sample-prose-plan.md"/>
</files>

<criteria>
  <criterion>
    <what>XML fixture file exists at tests/fixtures/sample-xml-plan.md</what>
    <how>file system presence</how>
    <command>ls tests/fixtures/sample-xml-plan.md</command>
  </criterion>
</criteria>

**Steps:**
1. Create fixtures directory
2. Write XML fixture
3. Write prose fixture

</task>

</plan>
