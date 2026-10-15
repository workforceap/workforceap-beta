# Digital Literacy language links

The member's existing English/Español portal switch sets `wap-locale` and
reloads the current page. The Digital Literacy module route reads the same
`next-intl` locale for its title, summary, practice topics, lesson labels,
completion controls, and learning destinations. The ten course slugs and
WorkforceAP completion records remain the same in either language.

## Provider contract

DigitalLearn's public application source at commit
[`53699fbb465d7e9fd467168cc5e6c8fb50835168`](https://github.com/commercekitchen/cpldl/tree/53699fbb465d7e9fd467168cc5e6c8fb50835168)
(October 14, 2026) establishes the language-entry contract:

- [`config/routes.rb`](https://github.com/commercekitchen/cpldl/blob/53699fbb465d7e9fd467168cc5e6c8fb50835168/config/routes.rb)
  retains `GET /home_language_toggle` outside its SPA route constraint.
- [`HomeController#language_toggle`](https://github.com/commercekitchen/cpldl/blob/53699fbb465d7e9fd467168cc5e6c8fb50835168/app/controllers/home_controller.rb)
  accepts the supported `lang=en` or `lang=es`, stores `session[:locale]`, skips
  authorization, and redirects back with the provider's root as its fallback.
- [`LocaleSetting`](https://github.com/commercekitchen/cpldl/blob/53699fbb465d7e9fd467168cc5e6c8fb50835168/app/controllers/concerns/locale_setting.rb)
  reads this session for guests. The SPA's
  [`localeApi.ts`](https://github.com/commercekitchen/cpldl/blob/53699fbb465d7e9fd467168cc5e6c8fb50835168/frontend/src/app/locale/localeApi.ts)
  loads it through `GET /api/v1/locale`; the course index filters by the selected
  language. A course-detail slug resolves a specific course record and does
  not become Spanish merely because the portal label is translated.

Accordingly, the explicit AT&T course-catalog action uses
`https://att.digitallearn.org/home_language_toggle?lang=en` or `lang=es`.
It is a native anchor with `referrerPolicy="no-referrer"` and
`rel="noopener noreferrer"`. Suppressing the referrer makes the provider use
its catalog root instead of redirecting back to WorkforceAP. No account or
cross-origin API request is needed to choose the provider's guest language.

The [AT&T catalog](https://att.digitallearn.org/) and
[AT&T ScreenReady](https://screenready.att.com/digital-literacy/) identify the
AT&T learning entry. The Public Library Association's
[bilingual-course announcement](https://www.ala.org/news/2022/05/together-att-pla-launches-new-digitallearn-courses-announces-new-incentive-program)
confirms English and Spanish courses.

## Topic routing and verification limits

English retains the existing individually verified DigitalLearn lesson and
materials URLs. Spanish actions explicitly open the language-selected course
catalog and ask the member to choose the listed topic; they do not claim to
start an individual lesson. Computer, internet, email, account/password,
video-conferencing, and online-safety modules use AT&T's curated catalog.
File management, cloud storage, Word, and job-search topics use the full
DigitalLearn Spanish catalog so AT&T's narrower selection does not hide
supplementary topics. Spanish primary actions never retain an English
course/material fallback with a translated label.

Source inspection and indexed provider pages support this contract. The cloud
environment's network policy blocks direct DigitalLearn requests, and the
connected web reader exposes only the provider's JavaScript shell. The live
language-cookie redirect and browser playback were therefore **not verified**
in this environment. Before release, exercise both catalog actions in a fresh
browser and in an existing provider session, confirm the catalog language,
then choose a relevant course. Individual Spanish deep links may replace the
catalog actions only after their current content and language are verified;
do not invent locale parameters or substitute one PDF sublesson for an
entire module.

Provider activity and certificates remain separate from WorkforceAP's local
completion, points, and counselor-visible progress. This change does not sync
provider activity, change course keys, or change completion requirements.
