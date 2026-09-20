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
| CronExecution | model | cron_executions | 9 | [schema:822](../../../prisma/schema.prisma#L822) |
| WeeklyRecap | model | weekly_recaps | 12 | [schema:839](../../../prisma/schema.prisma#L839) |
| PathwayStepProgress | model | pathway_step_progress | 11 | [schema:859](../../../prisma/schema.prisma#L859) |
| TrainingAccessRequest | model | training_access_requests | 12 | [schema:878](../../../prisma/schema.prisma#L878) |
| TrainingAccessStatus | enum | Prisma default | 7 | [schema:899](../../../prisma/schema.prisma#L899) |
| AutomationRule | model | automation_rules | 9 | [schema:909](../../../prisma/schema.prisma#L909) |
| AIToolResult | model | ai_tool_results | 11 | [schema:923](../../../prisma/schema.prisma#L923) |
| CoachMemory | model | coach_memories | 6 | [schema:948](../../../prisma/schema.prisma#L948) |
| ApplicationAiFeedback | model | application_ai_feedback | 9 | [schema:961](../../../prisma/schema.prisma#L961) |
| ApplicationAiFeedbackHowUsed | enum | application_ai_feedback_how_used | 4 | [schema:978](../../../prisma/schema.prisma#L978) |
| AIToolType | enum | Prisma default | 15 | [schema:987](../../../prisma/schema.prisma#L987) |
| CertStatus | enum | cert_status | 3 | [schema:1005](../../../prisma/schema.prisma#L1005) |
| UserCertification | model | user_certifications | 11 | [schema:1013](../../../prisma/schema.prisma#L1013) |
| BlogPost | model | blog_posts | 14 | [schema:1037](../../../prisma/schema.prisma#L1037) |
| Partner | model | partners | 54 | [schema:1060](../../../prisma/schema.prisma#L1060) |
| PartnerProgramCatalog | model | partner_program_catalog | 8 | [schema:1147](../../../prisma/schema.prisma#L1147) |
| PartnerUser | model | partner_users | 6 | [schema:1163](../../../prisma/schema.prisma#L1163) |
| Counselor | model | counselors | 11 | [schema:1176](../../../prisma/schema.prisma#L1176) |
| CounselorAffiliation | enum | counselor_affiliations | 4 | [schema:1198](../../../prisma/schema.prisma#L1198) |
| CounselorAssignment | model | counselor_assignments | 8 | [schema:1209](../../../prisma/schema.prisma#L1209) |
| MessageThreadKind | enum | message_thread_kind | 3 | [schema:1229](../../../prisma/schema.prisma#L1229) |
| MessageThread | model | message_threads | 19 | [schema:1238](../../../prisma/schema.prisma#L1238) |
| Message | model | messages | 7 | [schema:1267](../../../prisma/schema.prisma#L1267) |
| PartnerReferral | model | partner_referrals | 8 | [schema:1282](../../../prisma/schema.prisma#L1282) |
| SubgroupType | enum | Prisma default | 3 | [schema:1302](../../../prisma/schema.prisma#L1302) |
| MemberSubgroupAssignmentType | enum | Prisma default | 3 | [schema:1308](../../../prisma/schema.prisma#L1308) |
| Subgroup | model | subgroups | 14 | [schema:1314](../../../prisma/schema.prisma#L1314) |
| MemberSubgroup | model | member_subgroups | 9 | [schema:1338](../../../prisma/schema.prisma#L1338) |
| SubgroupLeader | model | subgroup_leaders | 7 | [schema:1357](../../../prisma/schema.prisma#L1357) |
| PlacementRecord | model | placement_records | 21 | [schema:1382](../../../prisma/schema.prisma#L1382) |
| PlacedOutcome | model | placed_outcomes | 11 | [schema:1417](../../../prisma/schema.prisma#L1417) |
| PartnerSignupRequest | model | partner_signup_requests | 11 | [schema:1435](../../../prisma/schema.prisma#L1435) |
| CounselorNote | model | counselor_notes | 8 | [schema:1452](../../../prisma/schema.prisma#L1452) |
| AdvisorSessionNote | model | advisor_session_notes | 8 | [schema:1468](../../../prisma/schema.prisma#L1468) |
| AuditLog | model | audit_logs | 10 | [schema:1484](../../../prisma/schema.prisma#L1484) |
| AuditEvent | model | audit_events | 13 | [schema:1510](../../../prisma/schema.prisma#L1510) |
| WioaReviewSnapshot | model | wioa_review_snapshots | 16 | [schema:1547](../../../prisma/schema.prisma#L1547) |
| InvitationRole | enum | Prisma default | 4 | [schema:1580](../../../prisma/schema.prisma#L1580) |
| InvitationStatus | enum | Prisma default | 4 | [schema:1587](../../../prisma/schema.prisma#L1587) |
| Invitation | model | invitations | 19 | [schema:1594](../../../prisma/schema.prisma#L1594) |
| Employer | model | employers | 39 | [schema:1633](../../../prisma/schema.prisma#L1633) |
| EmployerHiringIntent | model | employer_hiring_intents | 11 | [schema:1685](../../../prisma/schema.prisma#L1685) |
| EmployerScreeningPack | model | employer_screening_packs | 8 | [schema:1705](../../../prisma/schema.prisma#L1705) |
| EmployerSubscription | model | employer_subscriptions | 14 | [schema:1721](../../../prisma/schema.prisma#L1721) |
| JobLocationType | enum | job_location_type | 3 | [schema:1744](../../../prisma/schema.prisma#L1744) |
| JobTypeEnum | enum | job_type_enum | 3 | [schema:1752](../../../prisma/schema.prisma#L1752) |
| JobStatusEnum | enum | job_status_enum | 6 | [schema:1760](../../../prisma/schema.prisma#L1760) |
| Job | model | jobs | 37 | [schema:1771](../../../prisma/schema.prisma#L1771) |
| OrganizationProgramCatalog | model | organization_program_catalog | 23 | [schema:1820](../../../prisma/schema.prisma#L1820) |
| Course | model | courses | 14 | [schema:1857](../../../prisma/schema.prisma#L1857) |
| CourseEnrollment | model | course_enrollments | 19 | [schema:1879](../../../prisma/schema.prisma#L1879) |
| TrainingBillingPacket | model | training_billing_packets | 29 | [schema:1932](../../../prisma/schema.prisma#L1932) |
| XapiStatement | model | xapi_statements | 20 | [schema:1976](../../../prisma/schema.prisma#L1976) |
| CourseProgressStatus | enum | course_progress_status | 3 | [schema:2032](../../../prisma/schema.prisma#L2032) |
| CourseProgress | model | course_progress | 17 | [schema:2041](../../../prisma/schema.prisma#L2041) |
| MemberProgramProgress | model | member_program_progress | 8 | [schema:2074](../../../prisma/schema.prisma#L2074) |
| PreScreeningResponse | model | pre_screening_responses | 13 | [schema:2090](../../../prisma/schema.prisma#L2090) |
| PreScreeningDraft | model | pre_screening_drafts | 13 | [schema:2111](../../../prisma/schema.prisma#L2111) |
| ApplyEligibilityScreening | model | apply_eligibility_screenings | 20 | [schema:2130](../../../prisma/schema.prisma#L2130) |
| PublicWioaScreening | model | public_wioa_screenings | 9 | [schema:2166](../../../prisma/schema.prisma#L2166) |
| JobPostingApplicationStatus | enum | job_posting_application_status | 6 | [schema:2183](../../../prisma/schema.prisma#L2183) |
| JobPostingApplication | model | job_posting_applications | 18 | [schema:2194](../../../prisma/schema.prisma#L2194) |
| ApplicationMessage | model | application_messages | 8 | [schema:2222](../../../prisma/schema.prisma#L2222) |
| PartnerOutreachLog | model | partner_outreach_logs | 10 | [schema:2238](../../../prisma/schema.prisma#L2238) |
| PortalWorkflowEvent | model | portal_workflow_events | 14 | [schema:2257](../../../prisma/schema.prisma#L2257) |
| AIJobMatchStatus | enum | ai_job_match_status | 7 | [schema:2280](../../../prisma/schema.prisma#L2280) |
| AIJobMatch | model | ai_job_matches | 10 | [schema:2292](../../../prisma/schema.prisma#L2292) |
| MentorSpecialty | model | mentor_specialties | 4 | [schema:2313](../../../prisma/schema.prisma#L2313) |
| Mentor | model | mentors | 17 | [schema:2324](../../../prisma/schema.prisma#L2324) |
| MentorSession | model | mentor_sessions | 13 | [schema:2347](../../../prisma/schema.prisma#L2347) |
| MentorSessionStatus | enum | Prisma default | 4 | [schema:2368](../../../prisma/schema.prisma#L2368) |
| CareerExperienceBand | enum | career_experience_band | 3 | [schema:2377](../../../prisma/schema.prisma#L2377) |
| CareerRecommendationType | enum | career_recommendation_type | 3 | [schema:2385](../../../prisma/schema.prisma#L2385) |
| OnetOccupation | model | onet_occupations | 21 | [schema:2393](../../../prisma/schema.prisma#L2393) |
| OnetOccupationSkill | model | onet_occupation_skills | 6 | [schema:2420](../../../prisma/schema.prisma#L2420) |
| OnetOccupationTask | model | onet_occupation_tasks | 5 | [schema:2433](../../../prisma/schema.prisma#L2433) |
| OnetOccupationTech | model | onet_occupation_tech | 5 | [schema:2445](../../../prisma/schema.prisma#L2445) |
| OnetRelatedOccupation | model | onet_related_occupations | 6 | [schema:2457](../../../prisma/schema.prisma#L2457) |
| CareerProgramMapping | model | career_program_mappings | 11 | [schema:2471](../../../prisma/schema.prisma#L2471) |
| CareerQuizRule | model | career_quiz_rules | 9 | [schema:2491](../../../prisma/schema.prisma#L2491) |
| MemberNextBestAction | model | member_next_best_actions | 12 | [schema:2505](../../../prisma/schema.prisma#L2505) |
| MemberPoints | model | member_points | 10 | [schema:2526](../../../prisma/schema.prisma#L2526) |
| PointsTransaction | model | points_transactions | 10 | [schema:2543](../../../prisma/schema.prisma#L2543) |
| ReferralCode | model | referral_codes | 5 | [schema:2567](../../../prisma/schema.prisma#L2567) |
| ReferralConversion | model | referral_conversions | 9 | [schema:2581](../../../prisma/schema.prisma#L2581) |
| CourseraCourseProgress | model | coursera_course_progress | 29 | [schema:2605](../../../prisma/schema.prisma#L2605) |
| CourseraCanonicalCourseMapping | model | coursera_canonical_course_mappings | 10 | [schema:2659](../../../prisma/schema.prisma#L2659) |
| CourseraCurriculumCourseMapping | model | coursera_curriculum_course_mappings | 9 | [schema:2682](../../../prisma/schema.prisma#L2682) |
| CourseraIdentityMapping | model | coursera_identity_mappings | 11 | [schema:2711](../../../prisma/schema.prisma#L2711) |
| CourseraBadgeProgress | model | coursera_badge_progress | 21 | [schema:2735](../../../prisma/schema.prisma#L2735) |
| AtRiskAlert | model | at_risk_alerts | 13 | [schema:2771](../../../prisma/schema.prisma#L2771) |
| MemberNudgeLog | model | member_nudge_logs | 7 | [schema:2797](../../../prisma/schema.prisma#L2797) |
| PlacementSurveyWave | enum | placement_survey_wave | 4 | [schema:2813](../../../prisma/schema.prisma#L2813) |
| PlacementSurvey | model | placement_surveys | 21 | [schema:2830](../../../prisma/schema.prisma#L2830) |
| TestimonialSource | enum | testimonial_source | 3 | [schema:2874](../../../prisma/schema.prisma#L2874) |
| TestimonialStatus | enum | testimonial_status | 4 | [schema:2882](../../../prisma/schema.prisma#L2882) |
| Testimonial | model | testimonials | 18 | [schema:2891](../../../prisma/schema.prisma#L2891) |
| CourseraSkillsetProgress | model | coursera_skillset_progress | 9 | [schema:2925](../../../prisma/schema.prisma#L2925) |
| MilestoneCascade | model | milestone_cascades | 23 | [schema:2952](../../../prisma/schema.prisma#L2952) |
| MemberFeedback | model | member_feedback | 8 | [schema:2998](../../../prisma/schema.prisma#L2998) |
| FeatureFlag | model | feature_flags | 9 | [schema:3018](../../../prisma/schema.prisma#L3018) |
| WebhookEvent | model | webhook_events | 13 | [schema:3042](../../../prisma/schema.prisma#L3042) |
| EmailTemplate | model | email_templates | 9 | [schema:3067](../../../prisma/schema.prisma#L3067) |
| Notification | model | notifications | 9 | [schema:3085](../../../prisma/schema.prisma#L3085) |
| PushSubscription | model | push_subscriptions | 8 | [schema:3107](../../../prisma/schema.prisma#L3107) |
| SavedJob | model | saved_jobs | 6 | [schema:3122](../../../prisma/schema.prisma#L3122) |
| WapJob | model | wap_jobs | 8 | [schema:3139](../../../prisma/schema.prisma#L3139) |
| TokenLinkType | enum | Prisma default | 3 | [schema:3158](../../../prisma/schema.prisma#L3158) |
| TokenizedLink | model | tokenized_link | 10 | [schema:3164](../../../prisma/schema.prisma#L3164) |
| UserTourState | model | user_tour_states | 9 | [schema:3187](../../../prisma/schema.prisma#L3187) |
