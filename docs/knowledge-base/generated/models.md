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
| BlogPost | model | blog_posts | 14 | [schema:1088](../../../prisma/schema.prisma#L1088) |
| Partner | model | partners | 54 | [schema:1111](../../../prisma/schema.prisma#L1111) |
| PartnerProgramCatalog | model | partner_program_catalog | 8 | [schema:1198](../../../prisma/schema.prisma#L1198) |
| PartnerUser | model | partner_users | 6 | [schema:1214](../../../prisma/schema.prisma#L1214) |
| Counselor | model | counselors | 11 | [schema:1227](../../../prisma/schema.prisma#L1227) |
| CounselorAffiliation | enum | counselor_affiliations | 4 | [schema:1249](../../../prisma/schema.prisma#L1249) |
| CounselorAssignment | model | counselor_assignments | 8 | [schema:1260](../../../prisma/schema.prisma#L1260) |
| MessageThreadKind | enum | message_thread_kind | 3 | [schema:1280](../../../prisma/schema.prisma#L1280) |
| MessageThread | model | message_threads | 19 | [schema:1289](../../../prisma/schema.prisma#L1289) |
| Message | model | messages | 7 | [schema:1318](../../../prisma/schema.prisma#L1318) |
| PartnerReferral | model | partner_referrals | 8 | [schema:1333](../../../prisma/schema.prisma#L1333) |
| SubgroupType | enum | Prisma default | 3 | [schema:1353](../../../prisma/schema.prisma#L1353) |
| MemberSubgroupAssignmentType | enum | Prisma default | 3 | [schema:1359](../../../prisma/schema.prisma#L1359) |
| Subgroup | model | subgroups | 14 | [schema:1365](../../../prisma/schema.prisma#L1365) |
| MemberSubgroup | model | member_subgroups | 9 | [schema:1389](../../../prisma/schema.prisma#L1389) |
| SubgroupLeader | model | subgroup_leaders | 7 | [schema:1408](../../../prisma/schema.prisma#L1408) |
| PlacementRecord | model | placement_records | 21 | [schema:1433](../../../prisma/schema.prisma#L1433) |
| PlacedOutcome | model | placed_outcomes | 11 | [schema:1468](../../../prisma/schema.prisma#L1468) |
| PartnerSignupRequest | model | partner_signup_requests | 11 | [schema:1486](../../../prisma/schema.prisma#L1486) |
| CounselorNote | model | counselor_notes | 8 | [schema:1503](../../../prisma/schema.prisma#L1503) |
| AdvisorSessionNote | model | advisor_session_notes | 8 | [schema:1519](../../../prisma/schema.prisma#L1519) |
| AuditLog | model | audit_logs | 10 | [schema:1535](../../../prisma/schema.prisma#L1535) |
| AuditEvent | model | audit_events | 13 | [schema:1561](../../../prisma/schema.prisma#L1561) |
| WioaReviewSnapshot | model | wioa_review_snapshots | 16 | [schema:1598](../../../prisma/schema.prisma#L1598) |
| InvitationRole | enum | Prisma default | 4 | [schema:1631](../../../prisma/schema.prisma#L1631) |
| InvitationStatus | enum | Prisma default | 4 | [schema:1638](../../../prisma/schema.prisma#L1638) |
| Invitation | model | invitations | 19 | [schema:1645](../../../prisma/schema.prisma#L1645) |
| Employer | model | employers | 39 | [schema:1684](../../../prisma/schema.prisma#L1684) |
| EmployerHiringIntent | model | employer_hiring_intents | 11 | [schema:1736](../../../prisma/schema.prisma#L1736) |
| EmployerScreeningPack | model | employer_screening_packs | 8 | [schema:1756](../../../prisma/schema.prisma#L1756) |
| EmployerSubscription | model | employer_subscriptions | 14 | [schema:1772](../../../prisma/schema.prisma#L1772) |
| JobLocationType | enum | job_location_type | 3 | [schema:1795](../../../prisma/schema.prisma#L1795) |
| JobTypeEnum | enum | job_type_enum | 3 | [schema:1803](../../../prisma/schema.prisma#L1803) |
| JobStatusEnum | enum | job_status_enum | 6 | [schema:1811](../../../prisma/schema.prisma#L1811) |
| Job | model | jobs | 37 | [schema:1822](../../../prisma/schema.prisma#L1822) |
| OrganizationProgramCatalog | model | organization_program_catalog | 23 | [schema:1871](../../../prisma/schema.prisma#L1871) |
| Course | model | courses | 14 | [schema:1908](../../../prisma/schema.prisma#L1908) |
| CourseEnrollment | model | course_enrollments | 19 | [schema:1930](../../../prisma/schema.prisma#L1930) |
| TrainingBillingPacket | model | training_billing_packets | 29 | [schema:1983](../../../prisma/schema.prisma#L1983) |
| XapiStatement | model | xapi_statements | 20 | [schema:2027](../../../prisma/schema.prisma#L2027) |
| CourseProgressStatus | enum | course_progress_status | 3 | [schema:2083](../../../prisma/schema.prisma#L2083) |
| CourseProgress | model | course_progress | 17 | [schema:2092](../../../prisma/schema.prisma#L2092) |
| MemberProgramProgress | model | member_program_progress | 8 | [schema:2125](../../../prisma/schema.prisma#L2125) |
| PreScreeningResponse | model | pre_screening_responses | 13 | [schema:2141](../../../prisma/schema.prisma#L2141) |
| PreScreeningDraft | model | pre_screening_drafts | 13 | [schema:2162](../../../prisma/schema.prisma#L2162) |
| ApplyEligibilityScreening | model | apply_eligibility_screenings | 20 | [schema:2181](../../../prisma/schema.prisma#L2181) |
| PublicWioaScreening | model | public_wioa_screenings | 9 | [schema:2217](../../../prisma/schema.prisma#L2217) |
| JobPostingApplicationStatus | enum | job_posting_application_status | 6 | [schema:2234](../../../prisma/schema.prisma#L2234) |
| JobPostingApplication | model | job_posting_applications | 18 | [schema:2245](../../../prisma/schema.prisma#L2245) |
| ApplicationMessage | model | application_messages | 8 | [schema:2273](../../../prisma/schema.prisma#L2273) |
| PartnerOutreachLog | model | partner_outreach_logs | 10 | [schema:2289](../../../prisma/schema.prisma#L2289) |
| PortalWorkflowEvent | model | portal_workflow_events | 14 | [schema:2308](../../../prisma/schema.prisma#L2308) |
| AIJobMatchStatus | enum | ai_job_match_status | 7 | [schema:2331](../../../prisma/schema.prisma#L2331) |
| AIJobMatch | model | ai_job_matches | 10 | [schema:2343](../../../prisma/schema.prisma#L2343) |
| MentorSpecialty | model | mentor_specialties | 4 | [schema:2364](../../../prisma/schema.prisma#L2364) |
| Mentor | model | mentors | 17 | [schema:2375](../../../prisma/schema.prisma#L2375) |
| MentorSession | model | mentor_sessions | 13 | [schema:2398](../../../prisma/schema.prisma#L2398) |
| MentorSessionStatus | enum | Prisma default | 4 | [schema:2419](../../../prisma/schema.prisma#L2419) |
| CareerExperienceBand | enum | career_experience_band | 3 | [schema:2428](../../../prisma/schema.prisma#L2428) |
| CareerRecommendationType | enum | career_recommendation_type | 3 | [schema:2436](../../../prisma/schema.prisma#L2436) |
| OnetOccupation | model | onet_occupations | 21 | [schema:2444](../../../prisma/schema.prisma#L2444) |
| OnetOccupationSkill | model | onet_occupation_skills | 6 | [schema:2471](../../../prisma/schema.prisma#L2471) |
| OnetOccupationTask | model | onet_occupation_tasks | 5 | [schema:2484](../../../prisma/schema.prisma#L2484) |
| OnetOccupationTech | model | onet_occupation_tech | 5 | [schema:2496](../../../prisma/schema.prisma#L2496) |
| OnetRelatedOccupation | model | onet_related_occupations | 6 | [schema:2508](../../../prisma/schema.prisma#L2508) |
| CareerProgramMapping | model | career_program_mappings | 11 | [schema:2522](../../../prisma/schema.prisma#L2522) |
| CareerQuizRule | model | career_quiz_rules | 9 | [schema:2542](../../../prisma/schema.prisma#L2542) |
| MemberNextBestAction | model | member_next_best_actions | 12 | [schema:2556](../../../prisma/schema.prisma#L2556) |
| MemberPoints | model | member_points | 10 | [schema:2577](../../../prisma/schema.prisma#L2577) |
| PointsTransaction | model | points_transactions | 10 | [schema:2594](../../../prisma/schema.prisma#L2594) |
| ReferralCode | model | referral_codes | 5 | [schema:2618](../../../prisma/schema.prisma#L2618) |
| ReferralConversion | model | referral_conversions | 9 | [schema:2632](../../../prisma/schema.prisma#L2632) |
| CourseraCourseProgress | model | coursera_course_progress | 29 | [schema:2656](../../../prisma/schema.prisma#L2656) |
| CourseraCanonicalCourseMapping | model | coursera_canonical_course_mappings | 10 | [schema:2710](../../../prisma/schema.prisma#L2710) |
| CourseraCurriculumCourseMapping | model | coursera_curriculum_course_mappings | 9 | [schema:2733](../../../prisma/schema.prisma#L2733) |
| CourseraIdentityMapping | model | coursera_identity_mappings | 11 | [schema:2762](../../../prisma/schema.prisma#L2762) |
| CourseraBadgeProgress | model | coursera_badge_progress | 21 | [schema:2786](../../../prisma/schema.prisma#L2786) |
| AtRiskAlert | model | at_risk_alerts | 13 | [schema:2822](../../../prisma/schema.prisma#L2822) |
| MemberNudgeLog | model | member_nudge_logs | 7 | [schema:2848](../../../prisma/schema.prisma#L2848) |
| PlacementSurveyWave | enum | placement_survey_wave | 4 | [schema:2864](../../../prisma/schema.prisma#L2864) |
| PlacementSurvey | model | placement_surveys | 21 | [schema:2881](../../../prisma/schema.prisma#L2881) |
| TestimonialSource | enum | testimonial_source | 3 | [schema:2925](../../../prisma/schema.prisma#L2925) |
| TestimonialStatus | enum | testimonial_status | 4 | [schema:2933](../../../prisma/schema.prisma#L2933) |
| Testimonial | model | testimonials | 18 | [schema:2942](../../../prisma/schema.prisma#L2942) |
| CourseraSkillsetProgress | model | coursera_skillset_progress | 9 | [schema:2976](../../../prisma/schema.prisma#L2976) |
| MilestoneCascade | model | milestone_cascades | 23 | [schema:3003](../../../prisma/schema.prisma#L3003) |
| MemberFeedback | model | member_feedback | 8 | [schema:3049](../../../prisma/schema.prisma#L3049) |
| FeatureFlag | model | feature_flags | 9 | [schema:3069](../../../prisma/schema.prisma#L3069) |
| WebhookEvent | model | webhook_events | 13 | [schema:3093](../../../prisma/schema.prisma#L3093) |
| EmailTemplate | model | email_templates | 9 | [schema:3118](../../../prisma/schema.prisma#L3118) |
| Notification | model | notifications | 9 | [schema:3136](../../../prisma/schema.prisma#L3136) |
| PushSubscription | model | push_subscriptions | 8 | [schema:3158](../../../prisma/schema.prisma#L3158) |
| SavedJob | model | saved_jobs | 6 | [schema:3173](../../../prisma/schema.prisma#L3173) |
| WapJob | model | wap_jobs | 8 | [schema:3190](../../../prisma/schema.prisma#L3190) |
| TokenLinkType | enum | Prisma default | 3 | [schema:3209](../../../prisma/schema.prisma#L3209) |
| TokenizedLink | model | tokenized_link | 10 | [schema:3215](../../../prisma/schema.prisma#L3215) |
| UserTourState | model | user_tour_states | 9 | [schema:3238](../../../prisma/schema.prisma#L3238) |
