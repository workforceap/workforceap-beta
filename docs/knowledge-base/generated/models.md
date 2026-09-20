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
| BlogPost | model | blog_posts | 14 | [schema:1038](../../../prisma/schema.prisma#L1038) |
| Partner | model | partners | 54 | [schema:1061](../../../prisma/schema.prisma#L1061) |
| PartnerProgramCatalog | model | partner_program_catalog | 8 | [schema:1148](../../../prisma/schema.prisma#L1148) |
| PartnerUser | model | partner_users | 6 | [schema:1164](../../../prisma/schema.prisma#L1164) |
| Counselor | model | counselors | 11 | [schema:1177](../../../prisma/schema.prisma#L1177) |
| CounselorAffiliation | enum | counselor_affiliations | 4 | [schema:1199](../../../prisma/schema.prisma#L1199) |
| CounselorAssignment | model | counselor_assignments | 8 | [schema:1210](../../../prisma/schema.prisma#L1210) |
| MessageThreadKind | enum | message_thread_kind | 3 | [schema:1230](../../../prisma/schema.prisma#L1230) |
| MessageThread | model | message_threads | 19 | [schema:1239](../../../prisma/schema.prisma#L1239) |
| Message | model | messages | 7 | [schema:1268](../../../prisma/schema.prisma#L1268) |
| PartnerReferral | model | partner_referrals | 8 | [schema:1283](../../../prisma/schema.prisma#L1283) |
| SubgroupType | enum | Prisma default | 3 | [schema:1303](../../../prisma/schema.prisma#L1303) |
| MemberSubgroupAssignmentType | enum | Prisma default | 3 | [schema:1309](../../../prisma/schema.prisma#L1309) |
| Subgroup | model | subgroups | 14 | [schema:1315](../../../prisma/schema.prisma#L1315) |
| MemberSubgroup | model | member_subgroups | 9 | [schema:1339](../../../prisma/schema.prisma#L1339) |
| SubgroupLeader | model | subgroup_leaders | 7 | [schema:1358](../../../prisma/schema.prisma#L1358) |
| PlacementRecord | model | placement_records | 21 | [schema:1383](../../../prisma/schema.prisma#L1383) |
| PlacedOutcome | model | placed_outcomes | 11 | [schema:1418](../../../prisma/schema.prisma#L1418) |
| PartnerSignupRequest | model | partner_signup_requests | 11 | [schema:1436](../../../prisma/schema.prisma#L1436) |
| CounselorNote | model | counselor_notes | 8 | [schema:1453](../../../prisma/schema.prisma#L1453) |
| AdvisorSessionNote | model | advisor_session_notes | 8 | [schema:1469](../../../prisma/schema.prisma#L1469) |
| AuditLog | model | audit_logs | 10 | [schema:1485](../../../prisma/schema.prisma#L1485) |
| AuditEvent | model | audit_events | 13 | [schema:1511](../../../prisma/schema.prisma#L1511) |
| WioaReviewSnapshot | model | wioa_review_snapshots | 16 | [schema:1550](../../../prisma/schema.prisma#L1550) |
| InvitationRole | enum | Prisma default | 4 | [schema:1583](../../../prisma/schema.prisma#L1583) |
| InvitationStatus | enum | Prisma default | 4 | [schema:1590](../../../prisma/schema.prisma#L1590) |
| Invitation | model | invitations | 19 | [schema:1597](../../../prisma/schema.prisma#L1597) |
| Employer | model | employers | 39 | [schema:1636](../../../prisma/schema.prisma#L1636) |
| EmployerHiringIntent | model | employer_hiring_intents | 11 | [schema:1688](../../../prisma/schema.prisma#L1688) |
| EmployerScreeningPack | model | employer_screening_packs | 8 | [schema:1708](../../../prisma/schema.prisma#L1708) |
| EmployerSubscription | model | employer_subscriptions | 14 | [schema:1724](../../../prisma/schema.prisma#L1724) |
| JobLocationType | enum | job_location_type | 3 | [schema:1747](../../../prisma/schema.prisma#L1747) |
| JobTypeEnum | enum | job_type_enum | 3 | [schema:1755](../../../prisma/schema.prisma#L1755) |
| JobStatusEnum | enum | job_status_enum | 6 | [schema:1763](../../../prisma/schema.prisma#L1763) |
| Job | model | jobs | 37 | [schema:1774](../../../prisma/schema.prisma#L1774) |
| OrganizationProgramCatalog | model | organization_program_catalog | 23 | [schema:1823](../../../prisma/schema.prisma#L1823) |
| Course | model | courses | 14 | [schema:1860](../../../prisma/schema.prisma#L1860) |
| CourseEnrollment | model | course_enrollments | 19 | [schema:1882](../../../prisma/schema.prisma#L1882) |
| TrainingBillingPacket | model | training_billing_packets | 29 | [schema:1935](../../../prisma/schema.prisma#L1935) |
| XapiStatement | model | xapi_statements | 20 | [schema:1979](../../../prisma/schema.prisma#L1979) |
| CourseProgressStatus | enum | course_progress_status | 3 | [schema:2035](../../../prisma/schema.prisma#L2035) |
| CourseProgress | model | course_progress | 17 | [schema:2044](../../../prisma/schema.prisma#L2044) |
| MemberProgramProgress | model | member_program_progress | 8 | [schema:2077](../../../prisma/schema.prisma#L2077) |
| PreScreeningResponse | model | pre_screening_responses | 13 | [schema:2093](../../../prisma/schema.prisma#L2093) |
| PreScreeningDraft | model | pre_screening_drafts | 13 | [schema:2114](../../../prisma/schema.prisma#L2114) |
| ApplyEligibilityScreening | model | apply_eligibility_screenings | 20 | [schema:2133](../../../prisma/schema.prisma#L2133) |
| PublicWioaScreening | model | public_wioa_screenings | 9 | [schema:2169](../../../prisma/schema.prisma#L2169) |
| JobPostingApplicationStatus | enum | job_posting_application_status | 6 | [schema:2186](../../../prisma/schema.prisma#L2186) |
| JobPostingApplication | model | job_posting_applications | 18 | [schema:2197](../../../prisma/schema.prisma#L2197) |
| ApplicationMessage | model | application_messages | 8 | [schema:2225](../../../prisma/schema.prisma#L2225) |
| PartnerOutreachLog | model | partner_outreach_logs | 10 | [schema:2241](../../../prisma/schema.prisma#L2241) |
| PortalWorkflowEvent | model | portal_workflow_events | 14 | [schema:2260](../../../prisma/schema.prisma#L2260) |
| AIJobMatchStatus | enum | ai_job_match_status | 7 | [schema:2283](../../../prisma/schema.prisma#L2283) |
| AIJobMatch | model | ai_job_matches | 10 | [schema:2295](../../../prisma/schema.prisma#L2295) |
| MentorSpecialty | model | mentor_specialties | 4 | [schema:2316](../../../prisma/schema.prisma#L2316) |
| Mentor | model | mentors | 17 | [schema:2327](../../../prisma/schema.prisma#L2327) |
| MentorSession | model | mentor_sessions | 13 | [schema:2350](../../../prisma/schema.prisma#L2350) |
| MentorSessionStatus | enum | Prisma default | 4 | [schema:2371](../../../prisma/schema.prisma#L2371) |
| CareerExperienceBand | enum | career_experience_band | 3 | [schema:2380](../../../prisma/schema.prisma#L2380) |
| CareerRecommendationType | enum | career_recommendation_type | 3 | [schema:2388](../../../prisma/schema.prisma#L2388) |
| OnetOccupation | model | onet_occupations | 21 | [schema:2396](../../../prisma/schema.prisma#L2396) |
| OnetOccupationSkill | model | onet_occupation_skills | 6 | [schema:2423](../../../prisma/schema.prisma#L2423) |
| OnetOccupationTask | model | onet_occupation_tasks | 5 | [schema:2436](../../../prisma/schema.prisma#L2436) |
| OnetOccupationTech | model | onet_occupation_tech | 5 | [schema:2448](../../../prisma/schema.prisma#L2448) |
| OnetRelatedOccupation | model | onet_related_occupations | 6 | [schema:2460](../../../prisma/schema.prisma#L2460) |
| CareerProgramMapping | model | career_program_mappings | 11 | [schema:2474](../../../prisma/schema.prisma#L2474) |
| CareerQuizRule | model | career_quiz_rules | 9 | [schema:2494](../../../prisma/schema.prisma#L2494) |
| MemberNextBestAction | model | member_next_best_actions | 12 | [schema:2508](../../../prisma/schema.prisma#L2508) |
| MemberPoints | model | member_points | 10 | [schema:2529](../../../prisma/schema.prisma#L2529) |
| PointsTransaction | model | points_transactions | 10 | [schema:2546](../../../prisma/schema.prisma#L2546) |
| ReferralCode | model | referral_codes | 5 | [schema:2570](../../../prisma/schema.prisma#L2570) |
| ReferralConversion | model | referral_conversions | 9 | [schema:2584](../../../prisma/schema.prisma#L2584) |
| CourseraCourseProgress | model | coursera_course_progress | 29 | [schema:2608](../../../prisma/schema.prisma#L2608) |
| CourseraCanonicalCourseMapping | model | coursera_canonical_course_mappings | 10 | [schema:2662](../../../prisma/schema.prisma#L2662) |
| CourseraCurriculumCourseMapping | model | coursera_curriculum_course_mappings | 9 | [schema:2685](../../../prisma/schema.prisma#L2685) |
| CourseraIdentityMapping | model | coursera_identity_mappings | 11 | [schema:2714](../../../prisma/schema.prisma#L2714) |
| CourseraBadgeProgress | model | coursera_badge_progress | 21 | [schema:2738](../../../prisma/schema.prisma#L2738) |
| AtRiskAlert | model | at_risk_alerts | 13 | [schema:2774](../../../prisma/schema.prisma#L2774) |
| MemberNudgeLog | model | member_nudge_logs | 7 | [schema:2800](../../../prisma/schema.prisma#L2800) |
| PlacementSurveyWave | enum | placement_survey_wave | 4 | [schema:2816](../../../prisma/schema.prisma#L2816) |
| PlacementSurvey | model | placement_surveys | 21 | [schema:2833](../../../prisma/schema.prisma#L2833) |
| TestimonialSource | enum | testimonial_source | 3 | [schema:2877](../../../prisma/schema.prisma#L2877) |
| TestimonialStatus | enum | testimonial_status | 4 | [schema:2885](../../../prisma/schema.prisma#L2885) |
| Testimonial | model | testimonials | 18 | [schema:2894](../../../prisma/schema.prisma#L2894) |
| CourseraSkillsetProgress | model | coursera_skillset_progress | 9 | [schema:2928](../../../prisma/schema.prisma#L2928) |
| MilestoneCascade | model | milestone_cascades | 23 | [schema:2955](../../../prisma/schema.prisma#L2955) |
| MemberFeedback | model | member_feedback | 8 | [schema:3001](../../../prisma/schema.prisma#L3001) |
| FeatureFlag | model | feature_flags | 9 | [schema:3021](../../../prisma/schema.prisma#L3021) |
| WebhookEvent | model | webhook_events | 13 | [schema:3045](../../../prisma/schema.prisma#L3045) |
| EmailTemplate | model | email_templates | 9 | [schema:3070](../../../prisma/schema.prisma#L3070) |
| Notification | model | notifications | 9 | [schema:3088](../../../prisma/schema.prisma#L3088) |
| PushSubscription | model | push_subscriptions | 8 | [schema:3110](../../../prisma/schema.prisma#L3110) |
| SavedJob | model | saved_jobs | 6 | [schema:3125](../../../prisma/schema.prisma#L3125) |
| WapJob | model | wap_jobs | 8 | [schema:3142](../../../prisma/schema.prisma#L3142) |
| TokenLinkType | enum | Prisma default | 3 | [schema:3161](../../../prisma/schema.prisma#L3161) |
| TokenizedLink | model | tokenized_link | 10 | [schema:3167](../../../prisma/schema.prisma#L3167) |
