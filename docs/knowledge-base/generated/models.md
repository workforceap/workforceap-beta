# Prisma schema index

[Machine fields and relationships](models.json) · [Complete relationship diagram](database-relations.mmd)

Declared Prisma schema only. Migration SQL, RLS, triggers, and actual production state require separate inspection. Each relation field is listed; inverse fields are retained.

| Name | Kind | Table mapping | Fields | Source |
| --- | --- | --- | ---: | --- |
| Organization | model | organizations | 34 | [schema:20](../../../prisma/schema.prisma#L20) |
| Chapter | model | chapters | 18 | [schema:61](../../../prisma/schema.prisma#L61) |
| ChapterMember | model | chapter_members | 8 | [schema:88](../../../prisma/schema.prisma#L88) |
| ChapterMeeting | model | chapter_meetings | 9 | [schema:105](../../../prisma/schema.prisma#L105) |
| ChapterCurriculumItem | model | chapter_curriculum_items | 8 | [schema:121](../../../prisma/schema.prisma#L121) |
| User | model | users | 141 | [schema:138](../../../prisma/schema.prisma#L138) |
| Profile | model | profiles | 46 | [schema:330](../../../prisma/schema.prisma#L330) |
| ReadinessChecklist | model | readiness_checklist | 12 | [schema:388](../../../prisma/schema.prisma#L388) |
| Application | model | applications | 15 | [schema:408](../../../prisma/schema.prisma#L408) |
| FundingSource | enum | Prisma default | 5 | [schema:432](../../../prisma/schema.prisma#L432) |
| ApplicationStatus | enum | Prisma default | 4 | [schema:440](../../../prisma/schema.prisma#L440) |
| Role | model | roles | 4 | [schema:447](../../../prisma/schema.prisma#L447) |
| UserRole | model | user_roles | 5 | [schema:457](../../../prisma/schema.prisma#L457) |
| Resource | model | resources | 8 | [schema:472](../../../prisma/schema.prisma#L472) |
| ResourceType | enum | Prisma default | 3 | [schema:485](../../../prisma/schema.prisma#L485) |
| JobApplication | model | job_applications | 18 | [schema:491](../../../prisma/schema.prisma#L491) |
| JobApplicationStatus | enum | Prisma default | 7 | [schema:524](../../../prisma/schema.prisma#L524) |
| JobApplicationSource | enum | Prisma default | 4 | [schema:534](../../../prisma/schema.prisma#L534) |
| BenefitRequest | model | benefit_requests | 7 | [schema:541](../../../prisma/schema.prisma#L541) |
| BenefitRequestStatus | enum | Prisma default | 3 | [schema:557](../../../prisma/schema.prisma#L557) |
| ProgramChangeRequest | model | program_change_requests | 13 | [schema:564](../../../prisma/schema.prisma#L564) |
| ProgramChangeRequestStatus | enum | Prisma default | 4 | [schema:586](../../../prisma/schema.prisma#L586) |
| PipelineBoardStage | enum | pipeline_board_stage | 6 | [schema:594](../../../prisma/schema.prisma#L594) |
| MemberStatus | enum | member_status | 3 | [schema:605](../../../prisma/schema.prisma#L605) |
| LearningProgress | model | learning_progress | 8 | [schema:613](../../../prisma/schema.prisma#L613) |
| MemberLabDraft | model | member_lab_drafts | 18 | [schema:630](../../../prisma/schema.prisma#L630) |
| MemberLabSubmission | model | member_lab_submissions | 17 | [schema:658](../../../prisma/schema.prisma#L658) |
| MemberLabReview | model | member_lab_reviews | 11 | [schema:685](../../../prisma/schema.prisma#L685) |
| TrainingStudyPlan | model | training_study_plans | 9 | [schema:702](../../../prisma/schema.prisma#L702) |
| TrainingCourseWork | model | training_course_work | 10 | [schema:720](../../../prisma/schema.prisma#L720) |
| Goal | model | goals | 14 | [schema:738](../../../prisma/schema.prisma#L738) |
| GoalStatus | enum | Prisma default | 3 | [schema:761](../../../prisma/schema.prisma#L761) |
| ResourceProgress | model | resource_progress | 12 | [schema:767](../../../prisma/schema.prisma#L767) |
| MemberEvent | model | member_events | 11 | [schema:788](../../../prisma/schema.prisma#L788) |
| WorkflowDiagnostic | model | workflow_diagnostics | 14 | [schema:811](../../../prisma/schema.prisma#L811) |
| EmailFailureSnapshot | model | email_failure_snapshots | 21 | [schema:842](../../../prisma/schema.prisma#L842) |
| EmailSendLog | model | email_send_logs | 25 | [schema:881](../../../prisma/schema.prisma#L881) |
| CronExecution | model | cron_executions | 9 | [schema:922](../../../prisma/schema.prisma#L922) |
| WeeklyRecap | model | weekly_recaps | 12 | [schema:939](../../../prisma/schema.prisma#L939) |
| PathwayStepProgress | model | pathway_step_progress | 11 | [schema:959](../../../prisma/schema.prisma#L959) |
| TrainingAccessRequest | model | training_access_requests | 12 | [schema:978](../../../prisma/schema.prisma#L978) |
| TrainingAccessStatus | enum | Prisma default | 7 | [schema:999](../../../prisma/schema.prisma#L999) |
| AutomationRule | model | automation_rules | 9 | [schema:1009](../../../prisma/schema.prisma#L1009) |
| AIToolResult | model | ai_tool_results | 11 | [schema:1023](../../../prisma/schema.prisma#L1023) |
| CoachMemory | model | coach_memories | 6 | [schema:1048](../../../prisma/schema.prisma#L1048) |
| ApplicationAiFeedback | model | application_ai_feedback | 9 | [schema:1061](../../../prisma/schema.prisma#L1061) |
| ApplicationAiFeedbackHowUsed | enum | application_ai_feedback_how_used | 4 | [schema:1078](../../../prisma/schema.prisma#L1078) |
| AIToolType | enum | Prisma default | 15 | [schema:1087](../../../prisma/schema.prisma#L1087) |
| CertStatus | enum | cert_status | 3 | [schema:1105](../../../prisma/schema.prisma#L1105) |
| UserCertification | model | user_certifications | 11 | [schema:1113](../../../prisma/schema.prisma#L1113) |
| BlogPost | model | blog_posts | 14 | [schema:1139](../../../prisma/schema.prisma#L1139) |
| Partner | model | partners | 54 | [schema:1162](../../../prisma/schema.prisma#L1162) |
| PartnerProgramCatalog | model | partner_program_catalog | 8 | [schema:1249](../../../prisma/schema.prisma#L1249) |
| PartnerUser | model | partner_users | 6 | [schema:1265](../../../prisma/schema.prisma#L1265) |
| Counselor | model | counselors | 11 | [schema:1278](../../../prisma/schema.prisma#L1278) |
| CounselorAffiliation | enum | counselor_affiliations | 4 | [schema:1300](../../../prisma/schema.prisma#L1300) |
| CounselorAssignment | model | counselor_assignments | 8 | [schema:1311](../../../prisma/schema.prisma#L1311) |
| MessageThreadKind | enum | message_thread_kind | 3 | [schema:1331](../../../prisma/schema.prisma#L1331) |
| MessageThread | model | message_threads | 19 | [schema:1340](../../../prisma/schema.prisma#L1340) |
| Message | model | messages | 7 | [schema:1369](../../../prisma/schema.prisma#L1369) |
| PartnerReferral | model | partner_referrals | 8 | [schema:1384](../../../prisma/schema.prisma#L1384) |
| SubgroupType | enum | Prisma default | 3 | [schema:1404](../../../prisma/schema.prisma#L1404) |
| MemberSubgroupAssignmentType | enum | Prisma default | 3 | [schema:1410](../../../prisma/schema.prisma#L1410) |
| Subgroup | model | subgroups | 14 | [schema:1416](../../../prisma/schema.prisma#L1416) |
| MemberSubgroup | model | member_subgroups | 9 | [schema:1440](../../../prisma/schema.prisma#L1440) |
| SubgroupLeader | model | subgroup_leaders | 7 | [schema:1459](../../../prisma/schema.prisma#L1459) |
| PlacementRecord | model | placement_records | 21 | [schema:1484](../../../prisma/schema.prisma#L1484) |
| PlacedOutcome | model | placed_outcomes | 11 | [schema:1519](../../../prisma/schema.prisma#L1519) |
| PartnerSignupRequest | model | partner_signup_requests | 11 | [schema:1537](../../../prisma/schema.prisma#L1537) |
| CounselorNote | model | counselor_notes | 8 | [schema:1554](../../../prisma/schema.prisma#L1554) |
| AdvisorSessionNote | model | advisor_session_notes | 8 | [schema:1570](../../../prisma/schema.prisma#L1570) |
| AuditLog | model | audit_logs | 10 | [schema:1586](../../../prisma/schema.prisma#L1586) |
| AuditEvent | model | audit_events | 13 | [schema:1612](../../../prisma/schema.prisma#L1612) |
| WioaReviewSnapshot | model | wioa_review_snapshots | 16 | [schema:1651](../../../prisma/schema.prisma#L1651) |
| InvitationRole | enum | Prisma default | 4 | [schema:1684](../../../prisma/schema.prisma#L1684) |
| InvitationStatus | enum | Prisma default | 4 | [schema:1691](../../../prisma/schema.prisma#L1691) |
| Invitation | model | invitations | 19 | [schema:1698](../../../prisma/schema.prisma#L1698) |
| Employer | model | employers | 39 | [schema:1737](../../../prisma/schema.prisma#L1737) |
| EmployerHiringIntent | model | employer_hiring_intents | 11 | [schema:1789](../../../prisma/schema.prisma#L1789) |
| EmployerScreeningPack | model | employer_screening_packs | 8 | [schema:1809](../../../prisma/schema.prisma#L1809) |
| EmployerSubscription | model | employer_subscriptions | 14 | [schema:1825](../../../prisma/schema.prisma#L1825) |
| JobLocationType | enum | job_location_type | 3 | [schema:1848](../../../prisma/schema.prisma#L1848) |
| JobTypeEnum | enum | job_type_enum | 3 | [schema:1856](../../../prisma/schema.prisma#L1856) |
| JobStatusEnum | enum | job_status_enum | 6 | [schema:1864](../../../prisma/schema.prisma#L1864) |
| Job | model | jobs | 37 | [schema:1875](../../../prisma/schema.prisma#L1875) |
| OrganizationProgramCatalog | model | organization_program_catalog | 23 | [schema:1924](../../../prisma/schema.prisma#L1924) |
| Course | model | courses | 14 | [schema:1961](../../../prisma/schema.prisma#L1961) |
| CourseEnrollment | model | course_enrollments | 19 | [schema:1983](../../../prisma/schema.prisma#L1983) |
| TrainingBillingPacket | model | training_billing_packets | 29 | [schema:2036](../../../prisma/schema.prisma#L2036) |
| XapiStatement | model | xapi_statements | 20 | [schema:2080](../../../prisma/schema.prisma#L2080) |
| CourseProgressStatus | enum | course_progress_status | 3 | [schema:2136](../../../prisma/schema.prisma#L2136) |
| CourseProgress | model | course_progress | 17 | [schema:2145](../../../prisma/schema.prisma#L2145) |
| MemberProgramProgress | model | member_program_progress | 8 | [schema:2178](../../../prisma/schema.prisma#L2178) |
| PreScreeningResponse | model | pre_screening_responses | 13 | [schema:2194](../../../prisma/schema.prisma#L2194) |
| PreScreeningDraft | model | pre_screening_drafts | 13 | [schema:2215](../../../prisma/schema.prisma#L2215) |
| ApplyEligibilityScreening | model | apply_eligibility_screenings | 20 | [schema:2234](../../../prisma/schema.prisma#L2234) |
| PublicWioaScreening | model | public_wioa_screenings | 9 | [schema:2270](../../../prisma/schema.prisma#L2270) |
| JobPostingApplicationStatus | enum | job_posting_application_status | 6 | [schema:2287](../../../prisma/schema.prisma#L2287) |
| JobPostingApplication | model | job_posting_applications | 18 | [schema:2298](../../../prisma/schema.prisma#L2298) |
| ApplicationMessage | model | application_messages | 8 | [schema:2326](../../../prisma/schema.prisma#L2326) |
| PartnerOutreachLog | model | partner_outreach_logs | 10 | [schema:2342](../../../prisma/schema.prisma#L2342) |
| PortalWorkflowEvent | model | portal_workflow_events | 14 | [schema:2361](../../../prisma/schema.prisma#L2361) |
| AIJobMatchStatus | enum | ai_job_match_status | 7 | [schema:2384](../../../prisma/schema.prisma#L2384) |
| AIJobMatch | model | ai_job_matches | 10 | [schema:2396](../../../prisma/schema.prisma#L2396) |
| MentorSpecialty | model | mentor_specialties | 4 | [schema:2417](../../../prisma/schema.prisma#L2417) |
| Mentor | model | mentors | 17 | [schema:2428](../../../prisma/schema.prisma#L2428) |
| MentorSession | model | mentor_sessions | 13 | [schema:2451](../../../prisma/schema.prisma#L2451) |
| MentorSessionStatus | enum | Prisma default | 4 | [schema:2472](../../../prisma/schema.prisma#L2472) |
| CareerExperienceBand | enum | career_experience_band | 3 | [schema:2481](../../../prisma/schema.prisma#L2481) |
| CareerRecommendationType | enum | career_recommendation_type | 3 | [schema:2489](../../../prisma/schema.prisma#L2489) |
| OnetOccupation | model | onet_occupations | 21 | [schema:2497](../../../prisma/schema.prisma#L2497) |
| OnetOccupationSkill | model | onet_occupation_skills | 6 | [schema:2524](../../../prisma/schema.prisma#L2524) |
| OnetOccupationTask | model | onet_occupation_tasks | 5 | [schema:2537](../../../prisma/schema.prisma#L2537) |
| OnetOccupationTech | model | onet_occupation_tech | 5 | [schema:2549](../../../prisma/schema.prisma#L2549) |
| OnetRelatedOccupation | model | onet_related_occupations | 6 | [schema:2561](../../../prisma/schema.prisma#L2561) |
| CareerProgramMapping | model | career_program_mappings | 11 | [schema:2575](../../../prisma/schema.prisma#L2575) |
| CareerQuizRule | model | career_quiz_rules | 9 | [schema:2595](../../../prisma/schema.prisma#L2595) |
| MemberNextBestAction | model | member_next_best_actions | 12 | [schema:2609](../../../prisma/schema.prisma#L2609) |
| MemberPoints | model | member_points | 10 | [schema:2630](../../../prisma/schema.prisma#L2630) |
| PointsTransaction | model | points_transactions | 10 | [schema:2647](../../../prisma/schema.prisma#L2647) |
| ReferralCode | model | referral_codes | 5 | [schema:2671](../../../prisma/schema.prisma#L2671) |
| ReferralConversion | model | referral_conversions | 9 | [schema:2685](../../../prisma/schema.prisma#L2685) |
| CourseraCourseProgress | model | coursera_course_progress | 29 | [schema:2709](../../../prisma/schema.prisma#L2709) |
| CourseraCanonicalCourseMapping | model | coursera_canonical_course_mappings | 10 | [schema:2763](../../../prisma/schema.prisma#L2763) |
| CourseraCurriculumCourseMapping | model | coursera_curriculum_course_mappings | 9 | [schema:2786](../../../prisma/schema.prisma#L2786) |
| CourseraIdentityMapping | model | coursera_identity_mappings | 11 | [schema:2815](../../../prisma/schema.prisma#L2815) |
| CourseraBadgeProgress | model | coursera_badge_progress | 21 | [schema:2839](../../../prisma/schema.prisma#L2839) |
| AtRiskAlert | model | at_risk_alerts | 13 | [schema:2875](../../../prisma/schema.prisma#L2875) |
| MemberNudgeLog | model | member_nudge_logs | 7 | [schema:2901](../../../prisma/schema.prisma#L2901) |
| PlacementSurveyWave | enum | placement_survey_wave | 4 | [schema:2917](../../../prisma/schema.prisma#L2917) |
| PlacementSurvey | model | placement_surveys | 21 | [schema:2934](../../../prisma/schema.prisma#L2934) |
| TestimonialSource | enum | testimonial_source | 3 | [schema:2978](../../../prisma/schema.prisma#L2978) |
| TestimonialStatus | enum | testimonial_status | 4 | [schema:2986](../../../prisma/schema.prisma#L2986) |
| Testimonial | model | testimonials | 18 | [schema:2995](../../../prisma/schema.prisma#L2995) |
| CourseraSkillsetProgress | model | coursera_skillset_progress | 9 | [schema:3029](../../../prisma/schema.prisma#L3029) |
| MilestoneCascade | model | milestone_cascades | 23 | [schema:3056](../../../prisma/schema.prisma#L3056) |
| MemberFeedback | model | member_feedback | 8 | [schema:3102](../../../prisma/schema.prisma#L3102) |
| FeatureFlag | model | feature_flags | 9 | [schema:3122](../../../prisma/schema.prisma#L3122) |
| WebhookEvent | model | webhook_events | 13 | [schema:3146](../../../prisma/schema.prisma#L3146) |
| EmailTemplate | model | email_templates | 9 | [schema:3171](../../../prisma/schema.prisma#L3171) |
| Notification | model | notifications | 9 | [schema:3189](../../../prisma/schema.prisma#L3189) |
| PushSubscription | model | push_subscriptions | 8 | [schema:3211](../../../prisma/schema.prisma#L3211) |
| SavedJob | model | saved_jobs | 6 | [schema:3226](../../../prisma/schema.prisma#L3226) |
| WapJob | model | wap_jobs | 8 | [schema:3243](../../../prisma/schema.prisma#L3243) |
| TokenLinkType | enum | Prisma default | 3 | [schema:3262](../../../prisma/schema.prisma#L3262) |
| TokenizedLink | model | tokenized_link | 10 | [schema:3268](../../../prisma/schema.prisma#L3268) |
| UserTourState | model | user_tour_states | 9 | [schema:3291](../../../prisma/schema.prisma#L3291) |
