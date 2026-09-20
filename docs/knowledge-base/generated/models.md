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
| User | model | users | 139 | [schema:130](../../../prisma/schema.prisma#L130) |
| Profile | model | profiles | 46 | [schema:320](../../../prisma/schema.prisma#L320) |
| ReadinessChecklist | model | readiness_checklist | 12 | [schema:378](../../../prisma/schema.prisma#L378) |
| Application | model | applications | 15 | [schema:398](../../../prisma/schema.prisma#L398) |
| FundingSource | enum | Prisma default | 5 | [schema:422](../../../prisma/schema.prisma#L422) |
| ApplicationStatus | enum | Prisma default | 4 | [schema:430](../../../prisma/schema.prisma#L430) |
| Role | model | roles | 4 | [schema:437](../../../prisma/schema.prisma#L437) |
| UserRole | model | user_roles | 5 | [schema:447](../../../prisma/schema.prisma#L447) |
| Resource | model | resources | 8 | [schema:459](../../../prisma/schema.prisma#L459) |
| ResourceType | enum | Prisma default | 3 | [schema:472](../../../prisma/schema.prisma#L472) |
| JobApplication | model | job_applications | 18 | [schema:478](../../../prisma/schema.prisma#L478) |
| JobApplicationStatus | enum | Prisma default | 7 | [schema:511](../../../prisma/schema.prisma#L511) |
| JobApplicationSource | enum | Prisma default | 4 | [schema:521](../../../prisma/schema.prisma#L521) |
| BenefitRequest | model | benefit_requests | 7 | [schema:528](../../../prisma/schema.prisma#L528) |
| BenefitRequestStatus | enum | Prisma default | 3 | [schema:544](../../../prisma/schema.prisma#L544) |
| ProgramChangeRequest | model | program_change_requests | 13 | [schema:551](../../../prisma/schema.prisma#L551) |
| ProgramChangeRequestStatus | enum | Prisma default | 4 | [schema:573](../../../prisma/schema.prisma#L573) |
| PipelineBoardStage | enum | pipeline_board_stage | 6 | [schema:581](../../../prisma/schema.prisma#L581) |
| MemberStatus | enum | member_status | 3 | [schema:592](../../../prisma/schema.prisma#L592) |
| LearningProgress | model | learning_progress | 8 | [schema:600](../../../prisma/schema.prisma#L600) |
| MemberLabDraft | model | member_lab_drafts | 18 | [schema:617](../../../prisma/schema.prisma#L617) |
| MemberLabSubmission | model | member_lab_submissions | 17 | [schema:645](../../../prisma/schema.prisma#L645) |
| MemberLabReview | model | member_lab_reviews | 11 | [schema:672](../../../prisma/schema.prisma#L672) |
| TrainingStudyPlan | model | training_study_plans | 9 | [schema:689](../../../prisma/schema.prisma#L689) |
| TrainingCourseWork | model | training_course_work | 10 | [schema:707](../../../prisma/schema.prisma#L707) |
| Goal | model | goals | 14 | [schema:725](../../../prisma/schema.prisma#L725) |
| GoalStatus | enum | Prisma default | 3 | [schema:748](../../../prisma/schema.prisma#L748) |
| ResourceProgress | model | resource_progress | 12 | [schema:754](../../../prisma/schema.prisma#L754) |
| MemberEvent | model | member_events | 11 | [schema:775](../../../prisma/schema.prisma#L775) |
| WorkflowDiagnostic | model | workflow_diagnostics | 14 | [schema:798](../../../prisma/schema.prisma#L798) |
| CronExecution | model | cron_executions | 9 | [schema:821](../../../prisma/schema.prisma#L821) |
| WeeklyRecap | model | weekly_recaps | 12 | [schema:838](../../../prisma/schema.prisma#L838) |
| PathwayStepProgress | model | pathway_step_progress | 11 | [schema:858](../../../prisma/schema.prisma#L858) |
| TrainingAccessRequest | model | training_access_requests | 12 | [schema:877](../../../prisma/schema.prisma#L877) |
| TrainingAccessStatus | enum | Prisma default | 7 | [schema:898](../../../prisma/schema.prisma#L898) |
| AutomationRule | model | automation_rules | 9 | [schema:908](../../../prisma/schema.prisma#L908) |
| AIToolResult | model | ai_tool_results | 11 | [schema:922](../../../prisma/schema.prisma#L922) |
| CoachMemory | model | coach_memories | 6 | [schema:947](../../../prisma/schema.prisma#L947) |
| ApplicationAiFeedback | model | application_ai_feedback | 9 | [schema:960](../../../prisma/schema.prisma#L960) |
| ApplicationAiFeedbackHowUsed | enum | application_ai_feedback_how_used | 4 | [schema:977](../../../prisma/schema.prisma#L977) |
| AIToolType | enum | Prisma default | 15 | [schema:986](../../../prisma/schema.prisma#L986) |
| CertStatus | enum | cert_status | 3 | [schema:1004](../../../prisma/schema.prisma#L1004) |
| UserCertification | model | user_certifications | 11 | [schema:1012](../../../prisma/schema.prisma#L1012) |
| BlogPost | model | blog_posts | 14 | [schema:1036](../../../prisma/schema.prisma#L1036) |
| Partner | model | partners | 54 | [schema:1059](../../../prisma/schema.prisma#L1059) |
| PartnerProgramCatalog | model | partner_program_catalog | 8 | [schema:1146](../../../prisma/schema.prisma#L1146) |
| PartnerUser | model | partner_users | 6 | [schema:1162](../../../prisma/schema.prisma#L1162) |
| Counselor | model | counselors | 11 | [schema:1175](../../../prisma/schema.prisma#L1175) |
| CounselorAffiliation | enum | counselor_affiliations | 4 | [schema:1197](../../../prisma/schema.prisma#L1197) |
| CounselorAssignment | model | counselor_assignments | 8 | [schema:1208](../../../prisma/schema.prisma#L1208) |
| MessageThreadKind | enum | message_thread_kind | 3 | [schema:1228](../../../prisma/schema.prisma#L1228) |
| MessageThread | model | message_threads | 19 | [schema:1237](../../../prisma/schema.prisma#L1237) |
| Message | model | messages | 7 | [schema:1266](../../../prisma/schema.prisma#L1266) |
| PartnerReferral | model | partner_referrals | 8 | [schema:1281](../../../prisma/schema.prisma#L1281) |
| SubgroupType | enum | Prisma default | 3 | [schema:1301](../../../prisma/schema.prisma#L1301) |
| MemberSubgroupAssignmentType | enum | Prisma default | 3 | [schema:1307](../../../prisma/schema.prisma#L1307) |
| Subgroup | model | subgroups | 14 | [schema:1313](../../../prisma/schema.prisma#L1313) |
| MemberSubgroup | model | member_subgroups | 9 | [schema:1337](../../../prisma/schema.prisma#L1337) |
| SubgroupLeader | model | subgroup_leaders | 7 | [schema:1356](../../../prisma/schema.prisma#L1356) |
| PlacementRecord | model | placement_records | 21 | [schema:1381](../../../prisma/schema.prisma#L1381) |
| PlacedOutcome | model | placed_outcomes | 11 | [schema:1416](../../../prisma/schema.prisma#L1416) |
| PartnerSignupRequest | model | partner_signup_requests | 11 | [schema:1434](../../../prisma/schema.prisma#L1434) |
| CounselorNote | model | counselor_notes | 8 | [schema:1451](../../../prisma/schema.prisma#L1451) |
| AdvisorSessionNote | model | advisor_session_notes | 8 | [schema:1467](../../../prisma/schema.prisma#L1467) |
| AuditLog | model | audit_logs | 10 | [schema:1483](../../../prisma/schema.prisma#L1483) |
| AuditEvent | model | audit_events | 13 | [schema:1509](../../../prisma/schema.prisma#L1509) |
| WioaReviewSnapshot | model | wioa_review_snapshots | 16 | [schema:1546](../../../prisma/schema.prisma#L1546) |
| InvitationRole | enum | Prisma default | 4 | [schema:1579](../../../prisma/schema.prisma#L1579) |
| InvitationStatus | enum | Prisma default | 4 | [schema:1586](../../../prisma/schema.prisma#L1586) |
| Invitation | model | invitations | 19 | [schema:1593](../../../prisma/schema.prisma#L1593) |
| Employer | model | employers | 39 | [schema:1632](../../../prisma/schema.prisma#L1632) |
| EmployerHiringIntent | model | employer_hiring_intents | 11 | [schema:1684](../../../prisma/schema.prisma#L1684) |
| EmployerScreeningPack | model | employer_screening_packs | 8 | [schema:1704](../../../prisma/schema.prisma#L1704) |
| EmployerSubscription | model | employer_subscriptions | 14 | [schema:1720](../../../prisma/schema.prisma#L1720) |
| JobLocationType | enum | job_location_type | 3 | [schema:1743](../../../prisma/schema.prisma#L1743) |
| JobTypeEnum | enum | job_type_enum | 3 | [schema:1751](../../../prisma/schema.prisma#L1751) |
| JobStatusEnum | enum | job_status_enum | 6 | [schema:1759](../../../prisma/schema.prisma#L1759) |
| Job | model | jobs | 37 | [schema:1770](../../../prisma/schema.prisma#L1770) |
| OrganizationProgramCatalog | model | organization_program_catalog | 23 | [schema:1819](../../../prisma/schema.prisma#L1819) |
| Course | model | courses | 14 | [schema:1856](../../../prisma/schema.prisma#L1856) |
| CourseEnrollment | model | course_enrollments | 19 | [schema:1878](../../../prisma/schema.prisma#L1878) |
| TrainingBillingPacket | model | training_billing_packets | 29 | [schema:1931](../../../prisma/schema.prisma#L1931) |
| XapiStatement | model | xapi_statements | 20 | [schema:1975](../../../prisma/schema.prisma#L1975) |
| CourseProgressStatus | enum | course_progress_status | 3 | [schema:2031](../../../prisma/schema.prisma#L2031) |
| CourseProgress | model | course_progress | 17 | [schema:2040](../../../prisma/schema.prisma#L2040) |
| MemberProgramProgress | model | member_program_progress | 8 | [schema:2073](../../../prisma/schema.prisma#L2073) |
| PreScreeningResponse | model | pre_screening_responses | 13 | [schema:2089](../../../prisma/schema.prisma#L2089) |
| PreScreeningDraft | model | pre_screening_drafts | 13 | [schema:2110](../../../prisma/schema.prisma#L2110) |
| ApplyEligibilityScreening | model | apply_eligibility_screenings | 20 | [schema:2129](../../../prisma/schema.prisma#L2129) |
| PublicWioaScreening | model | public_wioa_screenings | 9 | [schema:2165](../../../prisma/schema.prisma#L2165) |
| JobPostingApplicationStatus | enum | job_posting_application_status | 6 | [schema:2182](../../../prisma/schema.prisma#L2182) |
| JobPostingApplication | model | job_posting_applications | 18 | [schema:2193](../../../prisma/schema.prisma#L2193) |
| ApplicationMessage | model | application_messages | 8 | [schema:2221](../../../prisma/schema.prisma#L2221) |
| PartnerOutreachLog | model | partner_outreach_logs | 10 | [schema:2237](../../../prisma/schema.prisma#L2237) |
| PortalWorkflowEvent | model | portal_workflow_events | 14 | [schema:2256](../../../prisma/schema.prisma#L2256) |
| AIJobMatchStatus | enum | ai_job_match_status | 7 | [schema:2279](../../../prisma/schema.prisma#L2279) |
| AIJobMatch | model | ai_job_matches | 10 | [schema:2291](../../../prisma/schema.prisma#L2291) |
| MentorSpecialty | model | mentor_specialties | 4 | [schema:2312](../../../prisma/schema.prisma#L2312) |
| Mentor | model | mentors | 17 | [schema:2323](../../../prisma/schema.prisma#L2323) |
| MentorSession | model | mentor_sessions | 13 | [schema:2346](../../../prisma/schema.prisma#L2346) |
| MentorSessionStatus | enum | Prisma default | 4 | [schema:2367](../../../prisma/schema.prisma#L2367) |
| CareerExperienceBand | enum | career_experience_band | 3 | [schema:2376](../../../prisma/schema.prisma#L2376) |
| CareerRecommendationType | enum | career_recommendation_type | 3 | [schema:2384](../../../prisma/schema.prisma#L2384) |
| OnetOccupation | model | onet_occupations | 21 | [schema:2392](../../../prisma/schema.prisma#L2392) |
| OnetOccupationSkill | model | onet_occupation_skills | 6 | [schema:2419](../../../prisma/schema.prisma#L2419) |
| OnetOccupationTask | model | onet_occupation_tasks | 5 | [schema:2432](../../../prisma/schema.prisma#L2432) |
| OnetOccupationTech | model | onet_occupation_tech | 5 | [schema:2444](../../../prisma/schema.prisma#L2444) |
| OnetRelatedOccupation | model | onet_related_occupations | 6 | [schema:2456](../../../prisma/schema.prisma#L2456) |
| CareerProgramMapping | model | career_program_mappings | 11 | [schema:2470](../../../prisma/schema.prisma#L2470) |
| CareerQuizRule | model | career_quiz_rules | 9 | [schema:2490](../../../prisma/schema.prisma#L2490) |
| MemberNextBestAction | model | member_next_best_actions | 12 | [schema:2504](../../../prisma/schema.prisma#L2504) |
| MemberPoints | model | member_points | 10 | [schema:2525](../../../prisma/schema.prisma#L2525) |
| PointsTransaction | model | points_transactions | 10 | [schema:2542](../../../prisma/schema.prisma#L2542) |
| ReferralCode | model | referral_codes | 5 | [schema:2566](../../../prisma/schema.prisma#L2566) |
| ReferralConversion | model | referral_conversions | 9 | [schema:2580](../../../prisma/schema.prisma#L2580) |
| CourseraCourseProgress | model | coursera_course_progress | 29 | [schema:2604](../../../prisma/schema.prisma#L2604) |
| CourseraCanonicalCourseMapping | model | coursera_canonical_course_mappings | 10 | [schema:2658](../../../prisma/schema.prisma#L2658) |
| CourseraCurriculumCourseMapping | model | coursera_curriculum_course_mappings | 9 | [schema:2681](../../../prisma/schema.prisma#L2681) |
| CourseraIdentityMapping | model | coursera_identity_mappings | 11 | [schema:2710](../../../prisma/schema.prisma#L2710) |
| CourseraBadgeProgress | model | coursera_badge_progress | 21 | [schema:2734](../../../prisma/schema.prisma#L2734) |
| AtRiskAlert | model | at_risk_alerts | 13 | [schema:2770](../../../prisma/schema.prisma#L2770) |
| MemberNudgeLog | model | member_nudge_logs | 7 | [schema:2796](../../../prisma/schema.prisma#L2796) |
| PlacementSurveyWave | enum | placement_survey_wave | 4 | [schema:2812](../../../prisma/schema.prisma#L2812) |
| PlacementSurvey | model | placement_surveys | 21 | [schema:2829](../../../prisma/schema.prisma#L2829) |
| TestimonialSource | enum | testimonial_source | 3 | [schema:2873](../../../prisma/schema.prisma#L2873) |
| TestimonialStatus | enum | testimonial_status | 4 | [schema:2881](../../../prisma/schema.prisma#L2881) |
| Testimonial | model | testimonials | 18 | [schema:2890](../../../prisma/schema.prisma#L2890) |
| CourseraSkillsetProgress | model | coursera_skillset_progress | 9 | [schema:2924](../../../prisma/schema.prisma#L2924) |
| MilestoneCascade | model | milestone_cascades | 23 | [schema:2951](../../../prisma/schema.prisma#L2951) |
| MemberFeedback | model | member_feedback | 8 | [schema:2997](../../../prisma/schema.prisma#L2997) |
| FeatureFlag | model | feature_flags | 9 | [schema:3017](../../../prisma/schema.prisma#L3017) |
| WebhookEvent | model | webhook_events | 13 | [schema:3041](../../../prisma/schema.prisma#L3041) |
| EmailTemplate | model | email_templates | 9 | [schema:3066](../../../prisma/schema.prisma#L3066) |
| Notification | model | notifications | 9 | [schema:3084](../../../prisma/schema.prisma#L3084) |
| PushSubscription | model | push_subscriptions | 8 | [schema:3106](../../../prisma/schema.prisma#L3106) |
| SavedJob | model | saved_jobs | 6 | [schema:3121](../../../prisma/schema.prisma#L3121) |
| WapJob | model | wap_jobs | 8 | [schema:3138](../../../prisma/schema.prisma#L3138) |
| TokenLinkType | enum | Prisma default | 3 | [schema:3157](../../../prisma/schema.prisma#L3157) |
| TokenizedLink | model | tokenized_link | 10 | [schema:3163](../../../prisma/schema.prisma#L3163) |
