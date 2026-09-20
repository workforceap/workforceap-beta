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
| BlogPost | model | blog_posts | 14 | [schema:1039](../../../prisma/schema.prisma#L1039) |
| Partner | model | partners | 54 | [schema:1062](../../../prisma/schema.prisma#L1062) |
| PartnerProgramCatalog | model | partner_program_catalog | 8 | [schema:1149](../../../prisma/schema.prisma#L1149) |
| PartnerUser | model | partner_users | 6 | [schema:1165](../../../prisma/schema.prisma#L1165) |
| Counselor | model | counselors | 11 | [schema:1178](../../../prisma/schema.prisma#L1178) |
| CounselorAffiliation | enum | counselor_affiliations | 4 | [schema:1200](../../../prisma/schema.prisma#L1200) |
| CounselorAssignment | model | counselor_assignments | 8 | [schema:1211](../../../prisma/schema.prisma#L1211) |
| MessageThreadKind | enum | message_thread_kind | 3 | [schema:1231](../../../prisma/schema.prisma#L1231) |
| MessageThread | model | message_threads | 19 | [schema:1240](../../../prisma/schema.prisma#L1240) |
| Message | model | messages | 7 | [schema:1269](../../../prisma/schema.prisma#L1269) |
| PartnerReferral | model | partner_referrals | 8 | [schema:1284](../../../prisma/schema.prisma#L1284) |
| SubgroupType | enum | Prisma default | 3 | [schema:1304](../../../prisma/schema.prisma#L1304) |
| MemberSubgroupAssignmentType | enum | Prisma default | 3 | [schema:1310](../../../prisma/schema.prisma#L1310) |
| Subgroup | model | subgroups | 14 | [schema:1316](../../../prisma/schema.prisma#L1316) |
| MemberSubgroup | model | member_subgroups | 9 | [schema:1340](../../../prisma/schema.prisma#L1340) |
| SubgroupLeader | model | subgroup_leaders | 7 | [schema:1359](../../../prisma/schema.prisma#L1359) |
| PlacementRecord | model | placement_records | 21 | [schema:1384](../../../prisma/schema.prisma#L1384) |
| PlacedOutcome | model | placed_outcomes | 11 | [schema:1419](../../../prisma/schema.prisma#L1419) |
| PartnerSignupRequest | model | partner_signup_requests | 11 | [schema:1437](../../../prisma/schema.prisma#L1437) |
| CounselorNote | model | counselor_notes | 8 | [schema:1454](../../../prisma/schema.prisma#L1454) |
| AdvisorSessionNote | model | advisor_session_notes | 8 | [schema:1470](../../../prisma/schema.prisma#L1470) |
| AuditLog | model | audit_logs | 10 | [schema:1486](../../../prisma/schema.prisma#L1486) |
| AuditEvent | model | audit_events | 13 | [schema:1512](../../../prisma/schema.prisma#L1512) |
| WioaReviewSnapshot | model | wioa_review_snapshots | 16 | [schema:1551](../../../prisma/schema.prisma#L1551) |
| InvitationRole | enum | Prisma default | 4 | [schema:1584](../../../prisma/schema.prisma#L1584) |
| InvitationStatus | enum | Prisma default | 4 | [schema:1591](../../../prisma/schema.prisma#L1591) |
| Invitation | model | invitations | 19 | [schema:1598](../../../prisma/schema.prisma#L1598) |
| Employer | model | employers | 39 | [schema:1637](../../../prisma/schema.prisma#L1637) |
| EmployerHiringIntent | model | employer_hiring_intents | 11 | [schema:1689](../../../prisma/schema.prisma#L1689) |
| EmployerScreeningPack | model | employer_screening_packs | 8 | [schema:1709](../../../prisma/schema.prisma#L1709) |
| EmployerSubscription | model | employer_subscriptions | 14 | [schema:1725](../../../prisma/schema.prisma#L1725) |
| JobLocationType | enum | job_location_type | 3 | [schema:1748](../../../prisma/schema.prisma#L1748) |
| JobTypeEnum | enum | job_type_enum | 3 | [schema:1756](../../../prisma/schema.prisma#L1756) |
| JobStatusEnum | enum | job_status_enum | 6 | [schema:1764](../../../prisma/schema.prisma#L1764) |
| Job | model | jobs | 37 | [schema:1775](../../../prisma/schema.prisma#L1775) |
| OrganizationProgramCatalog | model | organization_program_catalog | 23 | [schema:1824](../../../prisma/schema.prisma#L1824) |
| Course | model | courses | 14 | [schema:1861](../../../prisma/schema.prisma#L1861) |
| CourseEnrollment | model | course_enrollments | 19 | [schema:1883](../../../prisma/schema.prisma#L1883) |
| TrainingBillingPacket | model | training_billing_packets | 29 | [schema:1936](../../../prisma/schema.prisma#L1936) |
| XapiStatement | model | xapi_statements | 20 | [schema:1980](../../../prisma/schema.prisma#L1980) |
| CourseProgressStatus | enum | course_progress_status | 3 | [schema:2036](../../../prisma/schema.prisma#L2036) |
| CourseProgress | model | course_progress | 17 | [schema:2045](../../../prisma/schema.prisma#L2045) |
| MemberProgramProgress | model | member_program_progress | 8 | [schema:2078](../../../prisma/schema.prisma#L2078) |
| PreScreeningResponse | model | pre_screening_responses | 13 | [schema:2094](../../../prisma/schema.prisma#L2094) |
| PreScreeningDraft | model | pre_screening_drafts | 13 | [schema:2115](../../../prisma/schema.prisma#L2115) |
| ApplyEligibilityScreening | model | apply_eligibility_screenings | 20 | [schema:2134](../../../prisma/schema.prisma#L2134) |
| PublicWioaScreening | model | public_wioa_screenings | 9 | [schema:2170](../../../prisma/schema.prisma#L2170) |
| JobPostingApplicationStatus | enum | job_posting_application_status | 6 | [schema:2187](../../../prisma/schema.prisma#L2187) |
| JobPostingApplication | model | job_posting_applications | 18 | [schema:2198](../../../prisma/schema.prisma#L2198) |
| ApplicationMessage | model | application_messages | 8 | [schema:2226](../../../prisma/schema.prisma#L2226) |
| PartnerOutreachLog | model | partner_outreach_logs | 10 | [schema:2242](../../../prisma/schema.prisma#L2242) |
| PortalWorkflowEvent | model | portal_workflow_events | 14 | [schema:2261](../../../prisma/schema.prisma#L2261) |
| AIJobMatchStatus | enum | ai_job_match_status | 7 | [schema:2284](../../../prisma/schema.prisma#L2284) |
| AIJobMatch | model | ai_job_matches | 10 | [schema:2296](../../../prisma/schema.prisma#L2296) |
| MentorSpecialty | model | mentor_specialties | 4 | [schema:2317](../../../prisma/schema.prisma#L2317) |
| Mentor | model | mentors | 17 | [schema:2328](../../../prisma/schema.prisma#L2328) |
| MentorSession | model | mentor_sessions | 13 | [schema:2351](../../../prisma/schema.prisma#L2351) |
| MentorSessionStatus | enum | Prisma default | 4 | [schema:2372](../../../prisma/schema.prisma#L2372) |
| CareerExperienceBand | enum | career_experience_band | 3 | [schema:2381](../../../prisma/schema.prisma#L2381) |
| CareerRecommendationType | enum | career_recommendation_type | 3 | [schema:2389](../../../prisma/schema.prisma#L2389) |
| OnetOccupation | model | onet_occupations | 21 | [schema:2397](../../../prisma/schema.prisma#L2397) |
| OnetOccupationSkill | model | onet_occupation_skills | 6 | [schema:2424](../../../prisma/schema.prisma#L2424) |
| OnetOccupationTask | model | onet_occupation_tasks | 5 | [schema:2437](../../../prisma/schema.prisma#L2437) |
| OnetOccupationTech | model | onet_occupation_tech | 5 | [schema:2449](../../../prisma/schema.prisma#L2449) |
| OnetRelatedOccupation | model | onet_related_occupations | 6 | [schema:2461](../../../prisma/schema.prisma#L2461) |
| CareerProgramMapping | model | career_program_mappings | 11 | [schema:2475](../../../prisma/schema.prisma#L2475) |
| CareerQuizRule | model | career_quiz_rules | 9 | [schema:2495](../../../prisma/schema.prisma#L2495) |
| MemberNextBestAction | model | member_next_best_actions | 12 | [schema:2509](../../../prisma/schema.prisma#L2509) |
| MemberPoints | model | member_points | 10 | [schema:2530](../../../prisma/schema.prisma#L2530) |
| PointsTransaction | model | points_transactions | 10 | [schema:2547](../../../prisma/schema.prisma#L2547) |
| ReferralCode | model | referral_codes | 5 | [schema:2571](../../../prisma/schema.prisma#L2571) |
| ReferralConversion | model | referral_conversions | 9 | [schema:2585](../../../prisma/schema.prisma#L2585) |
| CourseraCourseProgress | model | coursera_course_progress | 29 | [schema:2609](../../../prisma/schema.prisma#L2609) |
| CourseraCanonicalCourseMapping | model | coursera_canonical_course_mappings | 10 | [schema:2663](../../../prisma/schema.prisma#L2663) |
| CourseraCurriculumCourseMapping | model | coursera_curriculum_course_mappings | 9 | [schema:2686](../../../prisma/schema.prisma#L2686) |
| CourseraIdentityMapping | model | coursera_identity_mappings | 11 | [schema:2715](../../../prisma/schema.prisma#L2715) |
| CourseraBadgeProgress | model | coursera_badge_progress | 21 | [schema:2739](../../../prisma/schema.prisma#L2739) |
| AtRiskAlert | model | at_risk_alerts | 13 | [schema:2775](../../../prisma/schema.prisma#L2775) |
| MemberNudgeLog | model | member_nudge_logs | 7 | [schema:2801](../../../prisma/schema.prisma#L2801) |
| PlacementSurveyWave | enum | placement_survey_wave | 4 | [schema:2817](../../../prisma/schema.prisma#L2817) |
| PlacementSurvey | model | placement_surveys | 21 | [schema:2834](../../../prisma/schema.prisma#L2834) |
| TestimonialSource | enum | testimonial_source | 3 | [schema:2878](../../../prisma/schema.prisma#L2878) |
| TestimonialStatus | enum | testimonial_status | 4 | [schema:2886](../../../prisma/schema.prisma#L2886) |
| Testimonial | model | testimonials | 18 | [schema:2895](../../../prisma/schema.prisma#L2895) |
| CourseraSkillsetProgress | model | coursera_skillset_progress | 9 | [schema:2929](../../../prisma/schema.prisma#L2929) |
| MilestoneCascade | model | milestone_cascades | 23 | [schema:2956](../../../prisma/schema.prisma#L2956) |
| MemberFeedback | model | member_feedback | 8 | [schema:3002](../../../prisma/schema.prisma#L3002) |
| FeatureFlag | model | feature_flags | 9 | [schema:3022](../../../prisma/schema.prisma#L3022) |
| WebhookEvent | model | webhook_events | 13 | [schema:3046](../../../prisma/schema.prisma#L3046) |
| EmailTemplate | model | email_templates | 9 | [schema:3071](../../../prisma/schema.prisma#L3071) |
| Notification | model | notifications | 9 | [schema:3089](../../../prisma/schema.prisma#L3089) |
| PushSubscription | model | push_subscriptions | 8 | [schema:3111](../../../prisma/schema.prisma#L3111) |
| SavedJob | model | saved_jobs | 6 | [schema:3126](../../../prisma/schema.prisma#L3126) |
| WapJob | model | wap_jobs | 8 | [schema:3143](../../../prisma/schema.prisma#L3143) |
| TokenLinkType | enum | Prisma default | 3 | [schema:3162](../../../prisma/schema.prisma#L3162) |
| TokenizedLink | model | tokenized_link | 10 | [schema:3168](../../../prisma/schema.prisma#L3168) |
| UserTourState | model | user_tour_states | 9 | [schema:3191](../../../prisma/schema.prisma#L3191) |
