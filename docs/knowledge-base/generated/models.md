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
| User | model | users | 140 | [schema:130](../../../prisma/schema.prisma#L130) |
| Profile | model | profiles | 46 | [schema:321](../../../prisma/schema.prisma#L321) |
| ReadinessChecklist | model | readiness_checklist | 12 | [schema:379](../../../prisma/schema.prisma#L379) |
| Application | model | applications | 15 | [schema:399](../../../prisma/schema.prisma#L399) |
| FundingSource | enum | Prisma default | 5 | [schema:423](../../../prisma/schema.prisma#L423) |
| ApplicationStatus | enum | Prisma default | 4 | [schema:431](../../../prisma/schema.prisma#L431) |
| Role | model | roles | 4 | [schema:438](../../../prisma/schema.prisma#L438) |
| UserRole | model | user_roles | 5 | [schema:448](../../../prisma/schema.prisma#L448) |
| Resource | model | resources | 8 | [schema:460](../../../prisma/schema.prisma#L460) |
| ResourceType | enum | Prisma default | 3 | [schema:473](../../../prisma/schema.prisma#L473) |
| JobApplication | model | job_applications | 18 | [schema:479](../../../prisma/schema.prisma#L479) |
| JobApplicationStatus | enum | Prisma default | 7 | [schema:512](../../../prisma/schema.prisma#L512) |
| JobApplicationSource | enum | Prisma default | 4 | [schema:522](../../../prisma/schema.prisma#L522) |
| BenefitRequest | model | benefit_requests | 7 | [schema:529](../../../prisma/schema.prisma#L529) |
| BenefitRequestStatus | enum | Prisma default | 3 | [schema:545](../../../prisma/schema.prisma#L545) |
| ProgramChangeRequest | model | program_change_requests | 13 | [schema:552](../../../prisma/schema.prisma#L552) |
| ProgramChangeRequestStatus | enum | Prisma default | 4 | [schema:574](../../../prisma/schema.prisma#L574) |
| PipelineBoardStage | enum | pipeline_board_stage | 6 | [schema:582](../../../prisma/schema.prisma#L582) |
| MemberStatus | enum | member_status | 3 | [schema:593](../../../prisma/schema.prisma#L593) |
| LearningProgress | model | learning_progress | 8 | [schema:601](../../../prisma/schema.prisma#L601) |
| MemberLabDraft | model | member_lab_drafts | 18 | [schema:618](../../../prisma/schema.prisma#L618) |
| MemberLabSubmission | model | member_lab_submissions | 17 | [schema:646](../../../prisma/schema.prisma#L646) |
| MemberLabReview | model | member_lab_reviews | 11 | [schema:673](../../../prisma/schema.prisma#L673) |
| TrainingStudyPlan | model | training_study_plans | 9 | [schema:690](../../../prisma/schema.prisma#L690) |
| TrainingCourseWork | model | training_course_work | 10 | [schema:708](../../../prisma/schema.prisma#L708) |
| Goal | model | goals | 14 | [schema:726](../../../prisma/schema.prisma#L726) |
| GoalStatus | enum | Prisma default | 3 | [schema:749](../../../prisma/schema.prisma#L749) |
| ResourceProgress | model | resource_progress | 12 | [schema:755](../../../prisma/schema.prisma#L755) |
| MemberEvent | model | member_events | 11 | [schema:776](../../../prisma/schema.prisma#L776) |
| WorkflowDiagnostic | model | workflow_diagnostics | 14 | [schema:799](../../../prisma/schema.prisma#L799) |
| EmailFailureSnapshot | model | email_failure_snapshots | 21 | [schema:830](../../../prisma/schema.prisma#L830) |
| CronExecution | model | cron_executions | 9 | [schema:860](../../../prisma/schema.prisma#L860) |
| WeeklyRecap | model | weekly_recaps | 12 | [schema:877](../../../prisma/schema.prisma#L877) |
| PathwayStepProgress | model | pathway_step_progress | 11 | [schema:897](../../../prisma/schema.prisma#L897) |
| TrainingAccessRequest | model | training_access_requests | 12 | [schema:916](../../../prisma/schema.prisma#L916) |
| TrainingAccessStatus | enum | Prisma default | 7 | [schema:937](../../../prisma/schema.prisma#L937) |
| AutomationRule | model | automation_rules | 9 | [schema:947](../../../prisma/schema.prisma#L947) |
| AIToolResult | model | ai_tool_results | 11 | [schema:961](../../../prisma/schema.prisma#L961) |
| CoachMemory | model | coach_memories | 6 | [schema:986](../../../prisma/schema.prisma#L986) |
| ApplicationAiFeedback | model | application_ai_feedback | 9 | [schema:999](../../../prisma/schema.prisma#L999) |
| ApplicationAiFeedbackHowUsed | enum | application_ai_feedback_how_used | 4 | [schema:1016](../../../prisma/schema.prisma#L1016) |
| AIToolType | enum | Prisma default | 15 | [schema:1025](../../../prisma/schema.prisma#L1025) |
| CertStatus | enum | cert_status | 3 | [schema:1043](../../../prisma/schema.prisma#L1043) |
| UserCertification | model | user_certifications | 11 | [schema:1051](../../../prisma/schema.prisma#L1051) |
| BlogPost | model | blog_posts | 14 | [schema:1077](../../../prisma/schema.prisma#L1077) |
| Partner | model | partners | 54 | [schema:1100](../../../prisma/schema.prisma#L1100) |
| PartnerProgramCatalog | model | partner_program_catalog | 8 | [schema:1187](../../../prisma/schema.prisma#L1187) |
| PartnerUser | model | partner_users | 6 | [schema:1203](../../../prisma/schema.prisma#L1203) |
| Counselor | model | counselors | 11 | [schema:1216](../../../prisma/schema.prisma#L1216) |
| CounselorAffiliation | enum | counselor_affiliations | 4 | [schema:1238](../../../prisma/schema.prisma#L1238) |
| CounselorAssignment | model | counselor_assignments | 8 | [schema:1249](../../../prisma/schema.prisma#L1249) |
| MessageThreadKind | enum | message_thread_kind | 3 | [schema:1269](../../../prisma/schema.prisma#L1269) |
| MessageThread | model | message_threads | 19 | [schema:1278](../../../prisma/schema.prisma#L1278) |
| Message | model | messages | 7 | [schema:1307](../../../prisma/schema.prisma#L1307) |
| PartnerReferral | model | partner_referrals | 8 | [schema:1322](../../../prisma/schema.prisma#L1322) |
| SubgroupType | enum | Prisma default | 3 | [schema:1342](../../../prisma/schema.prisma#L1342) |
| MemberSubgroupAssignmentType | enum | Prisma default | 3 | [schema:1348](../../../prisma/schema.prisma#L1348) |
| Subgroup | model | subgroups | 14 | [schema:1354](../../../prisma/schema.prisma#L1354) |
| MemberSubgroup | model | member_subgroups | 9 | [schema:1378](../../../prisma/schema.prisma#L1378) |
| SubgroupLeader | model | subgroup_leaders | 7 | [schema:1397](../../../prisma/schema.prisma#L1397) |
| PlacementRecord | model | placement_records | 21 | [schema:1422](../../../prisma/schema.prisma#L1422) |
| PlacedOutcome | model | placed_outcomes | 11 | [schema:1457](../../../prisma/schema.prisma#L1457) |
| PartnerSignupRequest | model | partner_signup_requests | 11 | [schema:1475](../../../prisma/schema.prisma#L1475) |
| CounselorNote | model | counselor_notes | 8 | [schema:1492](../../../prisma/schema.prisma#L1492) |
| AdvisorSessionNote | model | advisor_session_notes | 8 | [schema:1508](../../../prisma/schema.prisma#L1508) |
| AuditLog | model | audit_logs | 10 | [schema:1524](../../../prisma/schema.prisma#L1524) |
| AuditEvent | model | audit_events | 13 | [schema:1550](../../../prisma/schema.prisma#L1550) |
| WioaReviewSnapshot | model | wioa_review_snapshots | 16 | [schema:1589](../../../prisma/schema.prisma#L1589) |
| InvitationRole | enum | Prisma default | 4 | [schema:1622](../../../prisma/schema.prisma#L1622) |
| InvitationStatus | enum | Prisma default | 4 | [schema:1629](../../../prisma/schema.prisma#L1629) |
| Invitation | model | invitations | 19 | [schema:1636](../../../prisma/schema.prisma#L1636) |
| Employer | model | employers | 39 | [schema:1675](../../../prisma/schema.prisma#L1675) |
| EmployerHiringIntent | model | employer_hiring_intents | 11 | [schema:1727](../../../prisma/schema.prisma#L1727) |
| EmployerScreeningPack | model | employer_screening_packs | 8 | [schema:1747](../../../prisma/schema.prisma#L1747) |
| EmployerSubscription | model | employer_subscriptions | 14 | [schema:1763](../../../prisma/schema.prisma#L1763) |
| JobLocationType | enum | job_location_type | 3 | [schema:1786](../../../prisma/schema.prisma#L1786) |
| JobTypeEnum | enum | job_type_enum | 3 | [schema:1794](../../../prisma/schema.prisma#L1794) |
| JobStatusEnum | enum | job_status_enum | 6 | [schema:1802](../../../prisma/schema.prisma#L1802) |
| Job | model | jobs | 37 | [schema:1813](../../../prisma/schema.prisma#L1813) |
| OrganizationProgramCatalog | model | organization_program_catalog | 23 | [schema:1862](../../../prisma/schema.prisma#L1862) |
| Course | model | courses | 14 | [schema:1899](../../../prisma/schema.prisma#L1899) |
| CourseEnrollment | model | course_enrollments | 19 | [schema:1921](../../../prisma/schema.prisma#L1921) |
| TrainingBillingPacket | model | training_billing_packets | 29 | [schema:1974](../../../prisma/schema.prisma#L1974) |
| XapiStatement | model | xapi_statements | 20 | [schema:2018](../../../prisma/schema.prisma#L2018) |
| CourseProgressStatus | enum | course_progress_status | 3 | [schema:2074](../../../prisma/schema.prisma#L2074) |
| CourseProgress | model | course_progress | 17 | [schema:2083](../../../prisma/schema.prisma#L2083) |
| MemberProgramProgress | model | member_program_progress | 8 | [schema:2116](../../../prisma/schema.prisma#L2116) |
| PreScreeningResponse | model | pre_screening_responses | 13 | [schema:2132](../../../prisma/schema.prisma#L2132) |
| PreScreeningDraft | model | pre_screening_drafts | 13 | [schema:2153](../../../prisma/schema.prisma#L2153) |
| ApplyEligibilityScreening | model | apply_eligibility_screenings | 20 | [schema:2172](../../../prisma/schema.prisma#L2172) |
| PublicWioaScreening | model | public_wioa_screenings | 9 | [schema:2208](../../../prisma/schema.prisma#L2208) |
| JobPostingApplicationStatus | enum | job_posting_application_status | 6 | [schema:2225](../../../prisma/schema.prisma#L2225) |
| JobPostingApplication | model | job_posting_applications | 18 | [schema:2236](../../../prisma/schema.prisma#L2236) |
| ApplicationMessage | model | application_messages | 8 | [schema:2264](../../../prisma/schema.prisma#L2264) |
| PartnerOutreachLog | model | partner_outreach_logs | 10 | [schema:2280](../../../prisma/schema.prisma#L2280) |
| PortalWorkflowEvent | model | portal_workflow_events | 14 | [schema:2299](../../../prisma/schema.prisma#L2299) |
| AIJobMatchStatus | enum | ai_job_match_status | 7 | [schema:2322](../../../prisma/schema.prisma#L2322) |
| AIJobMatch | model | ai_job_matches | 10 | [schema:2334](../../../prisma/schema.prisma#L2334) |
| MentorSpecialty | model | mentor_specialties | 4 | [schema:2355](../../../prisma/schema.prisma#L2355) |
| Mentor | model | mentors | 17 | [schema:2366](../../../prisma/schema.prisma#L2366) |
| MentorSession | model | mentor_sessions | 13 | [schema:2389](../../../prisma/schema.prisma#L2389) |
| MentorSessionStatus | enum | Prisma default | 4 | [schema:2410](../../../prisma/schema.prisma#L2410) |
| CareerExperienceBand | enum | career_experience_band | 3 | [schema:2419](../../../prisma/schema.prisma#L2419) |
| CareerRecommendationType | enum | career_recommendation_type | 3 | [schema:2427](../../../prisma/schema.prisma#L2427) |
| OnetOccupation | model | onet_occupations | 21 | [schema:2435](../../../prisma/schema.prisma#L2435) |
| OnetOccupationSkill | model | onet_occupation_skills | 6 | [schema:2462](../../../prisma/schema.prisma#L2462) |
| OnetOccupationTask | model | onet_occupation_tasks | 5 | [schema:2475](../../../prisma/schema.prisma#L2475) |
| OnetOccupationTech | model | onet_occupation_tech | 5 | [schema:2487](../../../prisma/schema.prisma#L2487) |
| OnetRelatedOccupation | model | onet_related_occupations | 6 | [schema:2499](../../../prisma/schema.prisma#L2499) |
| CareerProgramMapping | model | career_program_mappings | 11 | [schema:2513](../../../prisma/schema.prisma#L2513) |
| CareerQuizRule | model | career_quiz_rules | 9 | [schema:2533](../../../prisma/schema.prisma#L2533) |
| MemberNextBestAction | model | member_next_best_actions | 12 | [schema:2547](../../../prisma/schema.prisma#L2547) |
| MemberPoints | model | member_points | 10 | [schema:2568](../../../prisma/schema.prisma#L2568) |
| PointsTransaction | model | points_transactions | 10 | [schema:2585](../../../prisma/schema.prisma#L2585) |
| ReferralCode | model | referral_codes | 5 | [schema:2609](../../../prisma/schema.prisma#L2609) |
| ReferralConversion | model | referral_conversions | 9 | [schema:2623](../../../prisma/schema.prisma#L2623) |
| CourseraCourseProgress | model | coursera_course_progress | 29 | [schema:2647](../../../prisma/schema.prisma#L2647) |
| CourseraCanonicalCourseMapping | model | coursera_canonical_course_mappings | 10 | [schema:2701](../../../prisma/schema.prisma#L2701) |
| CourseraCurriculumCourseMapping | model | coursera_curriculum_course_mappings | 9 | [schema:2724](../../../prisma/schema.prisma#L2724) |
| CourseraIdentityMapping | model | coursera_identity_mappings | 11 | [schema:2753](../../../prisma/schema.prisma#L2753) |
| CourseraBadgeProgress | model | coursera_badge_progress | 21 | [schema:2777](../../../prisma/schema.prisma#L2777) |
| AtRiskAlert | model | at_risk_alerts | 13 | [schema:2813](../../../prisma/schema.prisma#L2813) |
| MemberNudgeLog | model | member_nudge_logs | 7 | [schema:2839](../../../prisma/schema.prisma#L2839) |
| PlacementSurveyWave | enum | placement_survey_wave | 4 | [schema:2855](../../../prisma/schema.prisma#L2855) |
| PlacementSurvey | model | placement_surveys | 21 | [schema:2872](../../../prisma/schema.prisma#L2872) |
| TestimonialSource | enum | testimonial_source | 3 | [schema:2916](../../../prisma/schema.prisma#L2916) |
| TestimonialStatus | enum | testimonial_status | 4 | [schema:2924](../../../prisma/schema.prisma#L2924) |
| Testimonial | model | testimonials | 18 | [schema:2933](../../../prisma/schema.prisma#L2933) |
| CourseraSkillsetProgress | model | coursera_skillset_progress | 9 | [schema:2967](../../../prisma/schema.prisma#L2967) |
| MilestoneCascade | model | milestone_cascades | 23 | [schema:2994](../../../prisma/schema.prisma#L2994) |
| MemberFeedback | model | member_feedback | 8 | [schema:3040](../../../prisma/schema.prisma#L3040) |
| FeatureFlag | model | feature_flags | 9 | [schema:3060](../../../prisma/schema.prisma#L3060) |
| WebhookEvent | model | webhook_events | 13 | [schema:3084](../../../prisma/schema.prisma#L3084) |
| EmailTemplate | model | email_templates | 9 | [schema:3109](../../../prisma/schema.prisma#L3109) |
| Notification | model | notifications | 9 | [schema:3127](../../../prisma/schema.prisma#L3127) |
| PushSubscription | model | push_subscriptions | 8 | [schema:3149](../../../prisma/schema.prisma#L3149) |
| SavedJob | model | saved_jobs | 6 | [schema:3164](../../../prisma/schema.prisma#L3164) |
| WapJob | model | wap_jobs | 8 | [schema:3181](../../../prisma/schema.prisma#L3181) |
| TokenLinkType | enum | Prisma default | 3 | [schema:3200](../../../prisma/schema.prisma#L3200) |
| TokenizedLink | model | tokenized_link | 10 | [schema:3206](../../../prisma/schema.prisma#L3206) |
| UserTourState | model | user_tour_states | 9 | [schema:3229](../../../prisma/schema.prisma#L3229) |
