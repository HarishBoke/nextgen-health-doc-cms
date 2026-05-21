# Local UI Smoke Test Notes

The local frontend at `http://localhost:5173/` rendered the upgraded login/sign-up page with the healthcare document CMS hero, JWT login/sign-up controls, and feature cards for managed documents, CSS inlining, spec comparison, and AI fix content.

Using the smoke-test credentials `local-ui-smoke@example.com`, the sign-up workflow succeeded and redirected into the authenticated document workspace. The workspace displayed the signed-in user, logout control, document catalog cards for **SB**, **ANOC**, and **EOC**, and a **New document** action. The initial state correctly showed no managed documents for the new account.

The **New document** panel exposed the expected document title field, client selector with UnitedHealthcare and Generic Medicare Client options, and document-type selector with SB, ANOC, and EOC options. Creating the default UHG SB document opened the authoring UI successfully.

The editor displayed the saved document title, client and document type badges, workflow status selector, Save/HTML/PDF actions, page rail with three seeded pages, page title and number controls, section cards for page-level TinyMCE instances, repeater actions, and the right-side stylesheet/spec/style/AI review panel. This confirms that the UI now supports the requested page-to-section breakdown and repeater model.

The browser-level **Apply and inline CSS** action completed successfully from the stylesheet panel. The UI displayed an inlined HTML output textarea, reported **97 selector rules applied**, and surfaced unmatched-selector warnings for selectors that did not apply to the current document HTML. This verifies the requested external stylesheet-to-inline conversion workflow is present and visible to users.

The **Style** tab opened the deterministic style QA panel with a dedicated **Run style QA** button and explanatory text covering document-type/client-based checks for fonts, line-height, spacing, tables, and headings.

Running **Style QA** from the browser completed successfully, updated the top QA badge to **QA 100**, and rendered a result card showing **100%**, **7 rules checked**, and **0 findings**. The result confirms the browser workflow can save the managed document and execute deterministic style checks against the current document profile.

The **AI** tab displayed the expected **Run AI spec review** and **Get AI style fixes** controls, confirming that the AI review/fix workflow is present in the upgraded UI.

The browser-level **Get AI style fixes** action reached the backend and rendered a fallback result, but it exposed a backend serialization/parsing issue: the UI reported `Fix verdict: unavailable · 0% confidence` with the message `could not convert string to float: 'High'`. This indicates the AI/fallback response contains a textual confidence value where the API schema expects a numeric value, so the backend needs a small response normalization fix before final delivery.

After patching and restarting the backend, the **Get AI style fixes** action was re-tested in the browser. The previous textual-confidence parsing issue was resolved; the UI updated to **Fix verdict: pass · 100% confidence** with a successful completion message. This confirms AI style-fix suggestions now render correctly even when upstream confidence values are returned as text.

The **Run AI spec review** control correctly prevented execution when no uploaded PDF specification was available and showed the message **Upload a PDF specification before running AI review**, which is an appropriate guardrail for comparison against formal spec documents.

Clicking **Add repeater** on a section created a new repeater block with an editable **Repeater 1** label and delete control inside the section card. This verifies the requested section-level repeater authoring pattern is implemented in the UI.

The document saved successfully after adding the section repeater, confirming that the page/section/repeater data model persists through the authenticated managed-document update flow.

The **HTML** export control opened a generated export route and rendered the compiled document. The exported HTML included the new **Repeater 1** block under the first section, followed by the remaining UHG Summary of Benefits pages and table content, validating that repeaters are included in export output.

Returning to the application after HTML export showed the authenticated **Document workspace** with the managed SB document listed as **3 pages · 4 sections** and a current update timestamp. The persisted repeater remains represented in the saved document and export while the high-level section count remains accurate.
