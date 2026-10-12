# October catalog reconciliation (WAP-287)

Source inspected October 11, 2026: the owner's October 8 WAP mailbox message
`1a11dc63200fa601`, attachment `0a-WorkforceAP_Catalog_Final_2026.pdf` (29 pages,
1,840,300 bytes), effective September 17, 2026. The complete extracted text was
read, not just the attachment preview. Extracted UTF-8 text SHA-256:
`dd632566c390e6cd123fde2857784b4079b34fd63657e4cb81dfb1f56e5a06da`.
This identifies the extracted text, not the original PDF bytes. The separate
October 8 message `1a11d282193ca290` asks for website consistency; October 9
`1a1212e2dac3decb` repeats the instruction and reports a missing AI program choice.
Personal correspondence and applicant details are not copied here.

On October 12, message `1a131637333e086f` reattached the 29-page catalog.
Its complete extracted text (113,657 characters) has the same SHA-256
`dd632566c390e6cd123fde2857784b4079b34fd63657e4cb81dfb1f56e5a06da`
as the October 8 extraction; this does not establish that the PDF binaries are
identical. The repeated J5 class-description, date and cost request is tracked
as WAP-303 for creation/preview parity; the saved J5 PDF cost presentation was
already shipped under WAP-292. Sending an enrollment template is separate
WAP-304 work, distinct from current upload/review/download and WAP-288's
controlled billing-mail acceptance. The catalog decisions below remain open.

The owner's exact funding instruction is “All are funded except 0,1,14,15”.
These are document numbers, not positions in the application's array:

| Number | Document pathway | Source mapping and action |
| --- | --- | --- |
| 0 | Digital Literacy Training | `digital-literacy-empowerment-class`; existing separate Grant claim retained |
| 1 | Admin Assistant w/ Customer Service, Tech+, and CAPM Certificate | Absent from both source catalogs; proposal below |
| 14 | Certified Production Technician (CPT) 4.0 + CompTIA Tech+ | `certified-production-technician-cpt`; public funding confirmation required |
| 15 | Certified Logistics Technician (CLT) 4.0 + CompTIA Tech+ | `certified-logistics-technician-clt`; public funding confirmation required |

[Public funding display helpers](../../marketing/src/data/programFunding.ts) now
correct the listing and detail-page claims for CPT/CLT. The price list already
withholds these draft programs; it remains unchanged. Public copy
requests advisor confirmation rather than promising no-cost funded participation.
The catalogs' operational `fundingSource` values, server WIOA exemptions,
construction wording, tenant eligibility, assignments and paused curricula remain
unchanged. These labels are not a determination of an individual's funding.

The 12 existing regulated source pathways have the same total hours as the
attachment: 160 each except AI/Software Developer at 200. Every existing
regulated course name appears in the complete PDF text after whitespace and
punctuation normalization; this presence check does not prove sequence,
descriptions, individual hour allocations or provider activation. The catalog
adds Admin Assistant at 90 hours and publishes new CPT/CLT curricula at 160 each.

## Concrete remaining reconciliation proposal

The attachment contains 15 occupational pathways plus literacy; the current
source retains additional programs. Do not remove those programs based solely on
their absence from this document. Preserve existing enrollment/course keys.

1. Add the missing Admin Assistant pathway as an application interest with a new
   canonical slug and source-backed 13-course public syllabus: 90 hours, online
   self-paced, approximately nine weeks at 10 hours/week, $7,500 (page 7). Keep
   training assignment paused until the provider mapping, tenant availability and
   curriculum activation are explicitly established. Confirm the responsible
   program owner's canonical slug and rollout choice before adding this program.
2. Prepare new versioned CPT/CLT public curricula from pages 25/26: both 160 hours,
   140 core + 20 Tech+, hybrid instructor-supported, eight weeks at 20 hours/week,
   $7,500. CPT has four 35-hour core modules plus Tech+; CLT has seven 20-hour core
   modules plus Tech+. These differ from the current draft in-house lists. Require
   an explicit curriculum migration plan so existing mission/checkpoint keys and
   learner progress remain valid; do not overwrite those keys or activate courses
   solely because the PDF publishes them.
3. Resolve the DBA title discrepancy: page 16 omits “(DBA)” whereas the existing
   EDvera-approved August source includes it. Record which source governs public
   display before changing the regulated transcription.
4. Reproduce the reported first-dropdown issue with its actual entry/referral URL.
   Current regular [application results](../../app/apply/results/ApplyResultsClient.tsx)
   use all `PROGRAMS` and contain AI and Software Developer; school referral
   catalogs may restrict choices. No broad picker change is justified by the
   historical report alone.

This reconciliation does not certify current provider licenses, provider course
availability, deployed page freshness or complete catalog parity with the new PDF.
