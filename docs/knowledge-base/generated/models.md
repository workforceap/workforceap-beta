# Prisma schema index

[Machine fields and relationships](models.json) · [Complete relationship diagram](database-relations.mmd)

Declared Prisma schema only. Migration SQL, RLS, triggers, and actual production state require separate inspection. Each relation field is listed; inverse fields are retained.

| Name | Kind | Table mapping | Fields | Source |
| --- | --- | --- | ---: | --- |
| Organization | model | organizations | 34 | [schema:20](../../../prisma/schema.prisma#L20) |
| Chapter | model | chapters | 18 | [schema:61](../../../prisma/schema.prisma#L61) |
| ChapterMember | model | chapter_members | 8 | [schema:85](../../../prisma/schema.prisma#L85) |
| ChapterMeeting | model | chapter_meetings | 9 | [schema:100](../../../prisma/schema.prisma#L100) |
| ChapterCurriculumItem | model | chapter_curriculum_items | 8 | [schema:115](../../../prisma/schema.prisma#L115) |
| User | model | users | 141 | [schema:130](../../../prisma/schema.prisma#L130) |
| Profile | model | profiles | 46 | [schema:322](../../../prisma/schema.prisma#L322) |
| ReadinessChecklist | model | readiness_checklist | 12 | [schema:380](../../../prisma/schema.prisma#L380) |
| Application | model | applications | 15 | [schema:400](../../../prisma/schema.prisma#L400) |
| FundingSource | enum | Prisma default | 5 | [schema:424](../../../prisma/schema.prisma#L424) |
| ApplicationStatus | enum | Prisma default | 4 | [schema:432](../../../prisma/schema.prisma#L432) |
| Role | model | roles | 4 | [schema:439](../../../prisma/schema.prisma#L439) |
| UserRole | model | user_roles | 5 | [schema:449](../../../prisma/schema.prisma#L449) |
| Resource | model | resources | 8 | [schema:461](../../../prisma/schema.prisma#L461) |
| ResourceType | enum | Prisma default | 3 | [schema:474](../../../prisma/schema.prisma#L474) |
| JobApplication | model | job_applications | 18 | [schema:480](../../../prisma/schema.prisma#L480) |
| JobApplicationStatus | enum | Prisma default | 7 | [schema:513](../../../prisma/schema.prisma#L513) |
| JobApplicationSource | enum | Prisma default | 4 | [schema:523](../../../prisma/schema.prisma#L523) |
| BenefitRequest | model | benefit_requests | 7 | [schema:530](../../../prisma/schema.prisma#L530) |
| BenefitRequestStatus | enum | Prisma default | 3 | [schema:546](../../../prisma/schema.prisma#L546) |
| ProgramChangeRequest | model | program_change_requests | 13 | [schema:553](../../../prisma/schema.prisma#L553) |
| ProgramChangeRequestStatus | enum | Prisma default | 4 | [schema:575](../../../prisma/schema.prisma#L575) |
| PipelineBoardStage | enum | pipeline_board_stage | 6 | [schema:583](../../../prisma/schema.prisma#L583) |
| MemberStatus | enum | member_status | 3 | [schema:594](../../../prisma/schema.prisma#L594) |
| LearningProgress | model | learning_progress | 8 | [schema:602](../../../prisma/schema.prisma#L602) |
| MemberLabDraft | model | member_lab_drafts | 18 | [schema:619](../../../prisma/schema.prisma#L619) |
| MemberLabSubmission | model | member_lab_submissions | 17 | [schema:647](../../../prisma/schema.prisma#L647) |
| MemberLabReview | model | member_lab_reviews | 11 | [schema:674](../../../prisma/schema.prisma#L674) |
| TrainingStudyPlan | model | training_study_plans | 9 | [schema:691](../../../prisma/schema.prisma#L691) |
| TrainingCourseWork | model | training_course_work | 10 | [schema:709](../../../prisma/schema.prisma#L709) |
| Goal | model | goals | 14 | [schema:727](../../../prisma/schema.prisma#L727) |
| GoalStatus | enum | Prisma default | 3 | [schema:750](../../../prisma/schema.prisma#L750) |
| ResourceProgress | model | resource_progress | 12 | [schema:756](../../../prisma/schema.prisma#L756) |
| MemberEvent | model | member_events | 11 | [schema:777](../../../prisma/schema.prisma#L777) |
| WorkflowDiagnostic | model | workflow_diagnostics | 14 | [schema:800](../../../prisma/schema.prisma#L800) |
| EmailSendLog | model | email_send_logs | 25 | [schema:832](../../../prisma/schema.prisma#L832) |
| CronExecution | model | cron_executions | 9 | [schema:873](../../../prisma/schema.prisma#L873) |
| WeeklyRecap | model | weekly_recaps | 12 | [schema:890](../../../prisma/schema.prisma#L890) |
| PathwayStepProgress | model | pathway_step_progress | 11 | [schema:910](../../../prisma/schema.prisma#L910) |
| TrainingAccessRequest | model | training_access_requests | 12 | [schema:929](../../../prisma/schema.prisma#L929) |
| TrainingAccessStatus | enum | Prisma default | 7 | [schema:950](../../../prisma/schema.prisma#L950) |
| AutomationRule | model | automation_rules | 9 | [schema:960](../../../prisma/schema.prisma#L960) |
| AIToolResult | model | ai_tool_results | 11 | [schema:974](../../../prisma/schema.prisma#L974) |
| CoachMemory | model | coach_memories | 6 | [schema:999](../../../prisma/schema.prisma#L999) |
| ApplicationAiFeedback | model | application_ai_feedback | 9 | [schema:1012](../../../prisma/schema.prisma#L1012) |
| ApplicationAiFeedbackHowUsed | enum | application_ai_feedback_how_used | 4 | [schema:1029](../../../prisma/schema.prisma#L1029) |
| AIToolType | enum | Prisma default | 15 | [schema:1038](../../../prisma/schema.prisma#L1038) |
| CertStatus | enum | cert_status | 3 | [schema:1056](../../../prisma/schema.prisma#L1056) |
| UserCertification | model | user_certifications | 11 | [schema:1064](../../../prisma/schema.prisma#L1064) |
| BlogPost | model | blog_posts | 14 | [schema:1090](../../../prisma/schema.prisma#L1090) |
| Partner | model | partners | 54 | [schema:1113](../../../prisma/schema.prisma#L1113) |
| PartnerProgramCatalog | model | partner_program_catalog | 8 | [schema:1200](../../../prisma/schema.prisma#L1200) |
| PartnerUser | model | partner_users | 6 | [schema:1216](../../../prisma/schema.prisma#L1216) |
| Counselor | model | counselors | 11 | [schema:1229](../../../prisma/schema.prisma#L1229) |
| CounselorAffiliation | enum | counselor_affiliations | 4 | [schema:1251](../../../prisma/schema.prisma#L1251) |
| CounselorAssignment | model | counselor_assignments | 8 | [schema:1262](../../../prisma/schema.prisma#L1262) |
| MessageThreadKind | enum | message_thread_kind | 3 | [schema:1282](../../../prisma/schema.prisma#L1282) |
| MessageThread | model | message_threads | 19 | [schema:1291](../../../prisma/schema.prisma#L1291) |
| Message | model | messages | 7 | [schema:1320](../../../prisma/schema.prisma#L1320) |
| PartnerReferral | model | partner_referrals | 8 | [schema:1335](../../../prisma/schema.prisma#L1335) |
| SubgroupType | enum | Prisma default | 3 | [schema:1355](../../../prisma/schema.prisma#L1355) |
| MemberSubgroupAssignmentType | enum | Prisma default | 3 | [schema:1361](../../../prisma/schema.prisma#L1361) |
| Subgroup | model | subgroups | 14 | [schema:1367](../../../prisma/schema.prisma#L1367) |
| MemberSubgroup | model | member_subgroups | 9 | [schema:1391](../../../prisma/schema.prisma#L1391) |
| SubgroupLeader | model | subgroup_leaders | 7 | [schema:1410](../../../prisma/schema.prisma#L1410) |
| PlacementRecord | model | placement_records | 21 | [schema:1435](../../../prisma/schema.prisma#L1435) |
| PlacedOutcome | model | placed_outcomes | 11 | [schema:1470](../../../prisma/schema.prisma#L1470) |
| PartnerSignupRequest | model | partner_signup_requests | 11 | [schema:1488](../../../prisma/schema.prisma#L1488) |
| CounselorNote | model | counselor_notes | 8 | [schema:1505](../../../prisma/schema.prisma#L1505) |
| AdvisorSessionNote | model | advisor_session_notes | 8 | [schema:1521](../../../prisma/schema.prisma#L1521) |
| AuditLog | model | audit_logs | 10 | [schema:1537](../../../prisma/schema.prisma#L1537) |
| AuditEvent | model | audit_events | 13 | [schema:1563](../../../prisma/schema.prisma#L1563) |
| WioaReviewSnapshot | model | wioa_review_snapshots | 16 | [schema:1602](../../../prisma/schema.prisma#L1602) |
| InvitationRole | enum | Prisma default | 4 | [schema:1635](../../../prisma/schema.prisma#L1635) |
| InvitationStatus | enum | Prisma default | 4 | [schema:1642](../../../prisma/schema.prisma#L1642) |
| Invitation | model | invitations | 19 | [schema:1649](../../../prisma/schema.prisma#L1649) |
| Employer | model | employers | 39 | [schema:1688](../../../prisma/schema.prisma#L1688) |
| EmployerHiringIntent | model | employer_hiring_intents | 11 | [schema:1740](../../../prisma/schema.prisma#L1740) |
| EmployerScreeningPack | model | employer_screening_packs | 8 | [schema:1760](../../../prisma/schema.prisma#L1760) |
| EmployerSubscription | model | employer_subscriptions | 14 | [schema:1776](../../../prisma/schema.prisma#L1776) |
| JobLocationType | enum | job_location_type | 3 | [schema:1799](../../../prisma/schema.prisma#L1799) |
| JobTypeEnum | enum | job_type_enum | 3 | [schema:1807](../../../prisma/schema.prisma#L1807) |
| JobStatusEnum | enum | job_status_enum | 6 | [schema:1815](../../../prisma/schema.prisma#L1815) |
| Job | model | jobs | 37 | [schema:1826](../../../prisma/schema.prisma#L1826) |
| OrganizationProgramCatalog | model | organization_program_catalog | 23 | [schema:1875](../../../prisma/schema.prisma#L1875) |
| Course | model | courses | 14 | [schema:1912](../../../prisma/schema.prisma#L1912) |
| CourseEnrollment | model | course_enrollments | 19 | [schema:1934](../../../prisma/schema.prisma#L1934) |
| TrainingBillingPacket | model | training_billing_packets | 29 | [schema:1987](../../../prisma/schema.prisma#L1987) |
| XapiStatement | model | xapi_statements | 20 | [schema:2031](../../../prisma/schema.prisma#L2031) |
| CourseProgressStatus | enum | course_progress_status | 3 | [schema:2087](../../../prisma/schema.prisma#L2087) |
| CourseProgress | model | course_progress | 17 | [schema:2096](../../../prisma/schema.prisma#L2096) |
| MemberProgramProgress | model | member_program_progress | 8 | [schema:2129](../../../prisma/schema.prisma#L2129) |
| PreScreeningResponse | model | pre_screening_responses | 13 | [schema:2145](../../../prisma/schema.prisma#L2145) |
| PreScreeningDraft | model | pre_screening_drafts | 13 | [schema:2166](../../../prisma/schema.prisma#L2166) |
| ApplyEligibilityScreening | model | apply_eligibility_screenings | 20 | [schema:2185](../../../prisma/schema.prisma#L2185) |
| PublicWioaScreening | model | public_wioa_screenings | 9 | [schema:2221](../../../prisma/schema.prisma#L2221) |
| JobPostingApplicationStatus | enum | job_posting_application_status | 6 | [schema:2238](../../../prisma/schema.prisma#L2238) |
| JobPostingApplication | model | job_posting_applications | 18 | [schema:2249](../../../prisma/schema.prisma#L2249) |
| ApplicationMessage | model | application_messages | 8 | [schema:2277](../../../prisma/schema.prisma#L2277) |
| PartnerOutreachLog | model | partner_outreach_logs | 10 | [schema:2293](../../../prisma/schema.prisma#L2293) |
| PortalWorkflowEvent | model | portal_workflow_events | 14 | [schema:2312](../../../prisma/schema.prisma#L2312) |
| AIJobMatchStatus | enum | ai_job_match_status | 7 | [schema:2335](../../../prisma/schema.prisma#L2335) |
| AIJobMatch | model | ai_job_matches | 10 | [schema:2347](../../../prisma/schema.prisma#L2347) |
| MentorSpecialty | model | mentor_specialties | 4 | [schema:2368](../../../prisma/schema.prisma#L2368) |
| Mentor | model | mentors | 17 | [schema:2379](../../../prisma/schema.prisma#L2379) |
| MentorSession | model | mentor_sessions | 13 | [schema:2402](../../../prisma/schema.prisma#L2402) |
| MentorSessionStatus | enum | Prisma default | 4 | [schema:2423](../../../prisma/schema.prisma#L2423) |
| CareerExperienceBand | enum | career_experience_band | 3 | [schema:2432](../../../prisma/schema.prisma#L2432) |
| CareerRecommendationType | enum | career_recommendation_type | 3 | [schema:2440](../../../prisma/schema.prisma#L2440) |
| OnetOccupation | model | onet_occupations | 21 | [schema:2448](../../../prisma/schema.prisma#L2448) |
| OnetOccupationSkill | model | onet_occupation_skills | 6 | [schema:2475](../../../prisma/schema.prisma#L2475) |
| OnetOccupationTask | model | onet_occupation_tasks | 5 | [schema:2488](../../../prisma/schema.prisma#L2488) |
| OnetOccupationTech | model | onet_occupation_tech | 5 | [schema:2500](../../../prisma/schema.prisma#L2500) |
| OnetRelatedOccupation | model | onet_related_occupations | 6 | [schema:2512](../../../prisma/schema.prisma#L2512) |
| CareerProgramMapping | model | career_program_mappings | 11 | [schema:2526](../../../prisma/schema.prisma#L2526) |
| CareerQuizRule | model | career_quiz_rules | 9 | [schema:2546](../../../prisma/schema.prisma#L2546) |
| MemberNextBestAction | model | member_next_best_actions | 12 | [schema:2560](../../../prisma/schema.prisma#L2560) |
| MemberPoints | model | member_points | 10 | [schema:2581](../../../prisma/schema.prisma#L2581) |
| PointsTransaction | model | points_transactions | 10 | [schema:2598](../../../prisma/schema.prisma#L2598) |
| ReferralCode | model | referral_codes | 5 | [schema:2622](../../../prisma/schema.prisma#L2622) |
| ReferralConversion | model | referral_conversions | 9 | [schema:2636](../../../prisma/schema.prisma#L2636) |
| CourseraCourseProgress | model | coursera_course_progress | 29 | [schema:2660](../../../prisma/schema.prisma#L2660) |
| CourseraCanonicalCourseMapping | model | coursera_canonical_course_mappings | 10 | [schema:2714](../../../prisma/schema.prisma#L2714) |
| CourseraCurriculumCourseMapping | model | coursera_curriculum_course_mappings | 9 | [schema:2737](../../../prisma/schema.prisma#L2737) |
| CourseraIdentityMapping | model | coursera_identity_mappings | 11 | [schema:2766](../../../prisma/schema.prisma#L2766) |
| CourseraBadgeProgress | model | coursera_badge_progress | 21 | [schema:2790](../../../prisma/schema.prisma#L2790) |
| AtRiskAlert | model | at_risk_alerts | 13 | [schema:2826](../../../prisma/schema.prisma#L2826) |
| MemberNudgeLog | model | member_nudge_logs | 7 | [schema:2852](../../../prisma/schema.prisma#L2852) |
| PlacementSurveyWave | enum | placement_survey_wave | 4 | [schema:2868](../../../prisma/schema.prisma#L2868) |
| PlacementSurvey | model | placement_surveys | 21 | [schema:2885](../../../prisma/schema.prisma#L2885) |
| TestimonialSource | enum | testimonial_source | 3 | [schema:2929](../../../prisma/schema.prisma#L2929) |
| TestimonialStatus | enum | testimonial_status | 4 | [schema:2937](../../../prisma/schema.prisma#L2937) |
| Testimonial | model | testimonials | 18 | [schema:2946](../../../prisma/schema.prisma#L2946) |
| CourseraSkillsetProgress | model | coursera_skillset_progress | 9 | [schema:2980](../../../prisma/schema.prisma#L2980) |
| MilestoneCascade | model | milestone_cascades | 23 | [schema:3007](../../../prisma/schema.prisma#L3007) |
| MemberFeedback | model | member_feedback | 8 | [schema:3053](../../../prisma/schema.prisma#L3053) |
| FeatureFlag | model | feature_flags | 9 | [schema:3073](../../../prisma/schema.prisma#L3073) |
| WebhookEvent | model | webhook_events | 13 | [schema:3097](../../../prisma/schema.prisma#L3097) |
| EmailTemplate | model | email_templates | 9 | [schema:3122](../../../prisma/schema.prisma#L3122) |
| Notification | model | notifications | 9 | [schema:3140](../../../prisma/schema.prisma#L3140) |
| PushSubscription | model | push_subscriptions | 8 | [schema:3162](../../../prisma/schema.prisma#L3162) |
| SavedJob | model | saved_jobs | 6 | [schema:3177](../../../prisma/schema.prisma#L3177) |
| WapJob | model | wap_jobs | 8 | [schema:3194](../../../prisma/schema.prisma#L3194) |
| TokenLinkType | enum | Prisma default | 3 | [schema:3213](../../../prisma/schema.prisma#L3213) |
| TokenizedLink | model | tokenized_link | 10 | [schema:3219](../../../prisma/schema.prisma#L3219) |
| UserTourState | model | user_tour_states | 9 | [schema:3242](../../../prisma/schema.prisma#L3242) |
