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
| EmailFailureSnapshot | model | email_failure_snapshots | 21 | [schema:831](../../../prisma/schema.prisma#L831) |
| EmailSendLog | model | email_send_logs | 25 | [schema:870](../../../prisma/schema.prisma#L870) |
| CronExecution | model | cron_executions | 9 | [schema:911](../../../prisma/schema.prisma#L911) |
| WeeklyRecap | model | weekly_recaps | 12 | [schema:928](../../../prisma/schema.prisma#L928) |
| PathwayStepProgress | model | pathway_step_progress | 11 | [schema:948](../../../prisma/schema.prisma#L948) |
| TrainingAccessRequest | model | training_access_requests | 12 | [schema:967](../../../prisma/schema.prisma#L967) |
| TrainingAccessStatus | enum | Prisma default | 7 | [schema:988](../../../prisma/schema.prisma#L988) |
| AutomationRule | model | automation_rules | 9 | [schema:998](../../../prisma/schema.prisma#L998) |
| AIToolResult | model | ai_tool_results | 11 | [schema:1012](../../../prisma/schema.prisma#L1012) |
| CoachMemory | model | coach_memories | 6 | [schema:1037](../../../prisma/schema.prisma#L1037) |
| ApplicationAiFeedback | model | application_ai_feedback | 9 | [schema:1050](../../../prisma/schema.prisma#L1050) |
| ApplicationAiFeedbackHowUsed | enum | application_ai_feedback_how_used | 4 | [schema:1067](../../../prisma/schema.prisma#L1067) |
| AIToolType | enum | Prisma default | 15 | [schema:1076](../../../prisma/schema.prisma#L1076) |
| CertStatus | enum | cert_status | 3 | [schema:1094](../../../prisma/schema.prisma#L1094) |
| UserCertification | model | user_certifications | 11 | [schema:1102](../../../prisma/schema.prisma#L1102) |
| BlogPost | model | blog_posts | 14 | [schema:1128](../../../prisma/schema.prisma#L1128) |
| Partner | model | partners | 54 | [schema:1151](../../../prisma/schema.prisma#L1151) |
| PartnerProgramCatalog | model | partner_program_catalog | 8 | [schema:1238](../../../prisma/schema.prisma#L1238) |
| PartnerUser | model | partner_users | 6 | [schema:1254](../../../prisma/schema.prisma#L1254) |
| Counselor | model | counselors | 11 | [schema:1267](../../../prisma/schema.prisma#L1267) |
| CounselorAffiliation | enum | counselor_affiliations | 4 | [schema:1289](../../../prisma/schema.prisma#L1289) |
| CounselorAssignment | model | counselor_assignments | 8 | [schema:1300](../../../prisma/schema.prisma#L1300) |
| MessageThreadKind | enum | message_thread_kind | 3 | [schema:1320](../../../prisma/schema.prisma#L1320) |
| MessageThread | model | message_threads | 19 | [schema:1329](../../../prisma/schema.prisma#L1329) |
| Message | model | messages | 7 | [schema:1358](../../../prisma/schema.prisma#L1358) |
| PartnerReferral | model | partner_referrals | 8 | [schema:1373](../../../prisma/schema.prisma#L1373) |
| SubgroupType | enum | Prisma default | 3 | [schema:1393](../../../prisma/schema.prisma#L1393) |
| MemberSubgroupAssignmentType | enum | Prisma default | 3 | [schema:1399](../../../prisma/schema.prisma#L1399) |
| Subgroup | model | subgroups | 14 | [schema:1405](../../../prisma/schema.prisma#L1405) |
| MemberSubgroup | model | member_subgroups | 9 | [schema:1429](../../../prisma/schema.prisma#L1429) |
| SubgroupLeader | model | subgroup_leaders | 7 | [schema:1448](../../../prisma/schema.prisma#L1448) |
| PlacementRecord | model | placement_records | 21 | [schema:1473](../../../prisma/schema.prisma#L1473) |
| PlacedOutcome | model | placed_outcomes | 11 | [schema:1508](../../../prisma/schema.prisma#L1508) |
| PartnerSignupRequest | model | partner_signup_requests | 11 | [schema:1526](../../../prisma/schema.prisma#L1526) |
| CounselorNote | model | counselor_notes | 8 | [schema:1543](../../../prisma/schema.prisma#L1543) |
| AdvisorSessionNote | model | advisor_session_notes | 8 | [schema:1559](../../../prisma/schema.prisma#L1559) |
| AuditLog | model | audit_logs | 10 | [schema:1575](../../../prisma/schema.prisma#L1575) |
| AuditEvent | model | audit_events | 13 | [schema:1601](../../../prisma/schema.prisma#L1601) |
| WioaReviewSnapshot | model | wioa_review_snapshots | 16 | [schema:1640](../../../prisma/schema.prisma#L1640) |
| InvitationRole | enum | Prisma default | 4 | [schema:1673](../../../prisma/schema.prisma#L1673) |
| InvitationStatus | enum | Prisma default | 4 | [schema:1680](../../../prisma/schema.prisma#L1680) |
| Invitation | model | invitations | 19 | [schema:1687](../../../prisma/schema.prisma#L1687) |
| Employer | model | employers | 39 | [schema:1726](../../../prisma/schema.prisma#L1726) |
| EmployerHiringIntent | model | employer_hiring_intents | 11 | [schema:1778](../../../prisma/schema.prisma#L1778) |
| EmployerScreeningPack | model | employer_screening_packs | 8 | [schema:1798](../../../prisma/schema.prisma#L1798) |
| EmployerSubscription | model | employer_subscriptions | 14 | [schema:1814](../../../prisma/schema.prisma#L1814) |
| JobLocationType | enum | job_location_type | 3 | [schema:1837](../../../prisma/schema.prisma#L1837) |
| JobTypeEnum | enum | job_type_enum | 3 | [schema:1845](../../../prisma/schema.prisma#L1845) |
| JobStatusEnum | enum | job_status_enum | 6 | [schema:1853](../../../prisma/schema.prisma#L1853) |
| Job | model | jobs | 37 | [schema:1864](../../../prisma/schema.prisma#L1864) |
| OrganizationProgramCatalog | model | organization_program_catalog | 23 | [schema:1913](../../../prisma/schema.prisma#L1913) |
| Course | model | courses | 14 | [schema:1950](../../../prisma/schema.prisma#L1950) |
| CourseEnrollment | model | course_enrollments | 19 | [schema:1972](../../../prisma/schema.prisma#L1972) |
| TrainingBillingPacket | model | training_billing_packets | 29 | [schema:2025](../../../prisma/schema.prisma#L2025) |
| XapiStatement | model | xapi_statements | 20 | [schema:2069](../../../prisma/schema.prisma#L2069) |
| CourseProgressStatus | enum | course_progress_status | 3 | [schema:2125](../../../prisma/schema.prisma#L2125) |
| CourseProgress | model | course_progress | 17 | [schema:2134](../../../prisma/schema.prisma#L2134) |
| MemberProgramProgress | model | member_program_progress | 8 | [schema:2167](../../../prisma/schema.prisma#L2167) |
| PreScreeningResponse | model | pre_screening_responses | 13 | [schema:2183](../../../prisma/schema.prisma#L2183) |
| PreScreeningDraft | model | pre_screening_drafts | 13 | [schema:2204](../../../prisma/schema.prisma#L2204) |
| ApplyEligibilityScreening | model | apply_eligibility_screenings | 20 | [schema:2223](../../../prisma/schema.prisma#L2223) |
| PublicWioaScreening | model | public_wioa_screenings | 9 | [schema:2259](../../../prisma/schema.prisma#L2259) |
| JobPostingApplicationStatus | enum | job_posting_application_status | 6 | [schema:2276](../../../prisma/schema.prisma#L2276) |
| JobPostingApplication | model | job_posting_applications | 18 | [schema:2287](../../../prisma/schema.prisma#L2287) |
| ApplicationMessage | model | application_messages | 8 | [schema:2315](../../../prisma/schema.prisma#L2315) |
| PartnerOutreachLog | model | partner_outreach_logs | 10 | [schema:2331](../../../prisma/schema.prisma#L2331) |
| PortalWorkflowEvent | model | portal_workflow_events | 14 | [schema:2350](../../../prisma/schema.prisma#L2350) |
| AIJobMatchStatus | enum | ai_job_match_status | 7 | [schema:2373](../../../prisma/schema.prisma#L2373) |
| AIJobMatch | model | ai_job_matches | 10 | [schema:2385](../../../prisma/schema.prisma#L2385) |
| MentorSpecialty | model | mentor_specialties | 4 | [schema:2406](../../../prisma/schema.prisma#L2406) |
| Mentor | model | mentors | 17 | [schema:2417](../../../prisma/schema.prisma#L2417) |
| MentorSession | model | mentor_sessions | 13 | [schema:2440](../../../prisma/schema.prisma#L2440) |
| MentorSessionStatus | enum | Prisma default | 4 | [schema:2461](../../../prisma/schema.prisma#L2461) |
| CareerExperienceBand | enum | career_experience_band | 3 | [schema:2470](../../../prisma/schema.prisma#L2470) |
| CareerRecommendationType | enum | career_recommendation_type | 3 | [schema:2478](../../../prisma/schema.prisma#L2478) |
| OnetOccupation | model | onet_occupations | 21 | [schema:2486](../../../prisma/schema.prisma#L2486) |
| OnetOccupationSkill | model | onet_occupation_skills | 6 | [schema:2513](../../../prisma/schema.prisma#L2513) |
| OnetOccupationTask | model | onet_occupation_tasks | 5 | [schema:2526](../../../prisma/schema.prisma#L2526) |
| OnetOccupationTech | model | onet_occupation_tech | 5 | [schema:2538](../../../prisma/schema.prisma#L2538) |
| OnetRelatedOccupation | model | onet_related_occupations | 6 | [schema:2550](../../../prisma/schema.prisma#L2550) |
| CareerProgramMapping | model | career_program_mappings | 11 | [schema:2564](../../../prisma/schema.prisma#L2564) |
| CareerQuizRule | model | career_quiz_rules | 9 | [schema:2584](../../../prisma/schema.prisma#L2584) |
| MemberNextBestAction | model | member_next_best_actions | 12 | [schema:2598](../../../prisma/schema.prisma#L2598) |
| MemberPoints | model | member_points | 10 | [schema:2619](../../../prisma/schema.prisma#L2619) |
| PointsTransaction | model | points_transactions | 10 | [schema:2636](../../../prisma/schema.prisma#L2636) |
| ReferralCode | model | referral_codes | 5 | [schema:2660](../../../prisma/schema.prisma#L2660) |
| ReferralConversion | model | referral_conversions | 9 | [schema:2674](../../../prisma/schema.prisma#L2674) |
| CourseraCourseProgress | model | coursera_course_progress | 29 | [schema:2698](../../../prisma/schema.prisma#L2698) |
| CourseraCanonicalCourseMapping | model | coursera_canonical_course_mappings | 10 | [schema:2752](../../../prisma/schema.prisma#L2752) |
| CourseraCurriculumCourseMapping | model | coursera_curriculum_course_mappings | 9 | [schema:2775](../../../prisma/schema.prisma#L2775) |
| CourseraIdentityMapping | model | coursera_identity_mappings | 11 | [schema:2804](../../../prisma/schema.prisma#L2804) |
| CourseraBadgeProgress | model | coursera_badge_progress | 21 | [schema:2828](../../../prisma/schema.prisma#L2828) |
| AtRiskAlert | model | at_risk_alerts | 13 | [schema:2864](../../../prisma/schema.prisma#L2864) |
| MemberNudgeLog | model | member_nudge_logs | 7 | [schema:2890](../../../prisma/schema.prisma#L2890) |
| PlacementSurveyWave | enum | placement_survey_wave | 4 | [schema:2906](../../../prisma/schema.prisma#L2906) |
| PlacementSurvey | model | placement_surveys | 21 | [schema:2923](../../../prisma/schema.prisma#L2923) |
| TestimonialSource | enum | testimonial_source | 3 | [schema:2967](../../../prisma/schema.prisma#L2967) |
| TestimonialStatus | enum | testimonial_status | 4 | [schema:2975](../../../prisma/schema.prisma#L2975) |
| Testimonial | model | testimonials | 18 | [schema:2984](../../../prisma/schema.prisma#L2984) |
| CourseraSkillsetProgress | model | coursera_skillset_progress | 9 | [schema:3018](../../../prisma/schema.prisma#L3018) |
| MilestoneCascade | model | milestone_cascades | 23 | [schema:3045](../../../prisma/schema.prisma#L3045) |
| MemberFeedback | model | member_feedback | 8 | [schema:3091](../../../prisma/schema.prisma#L3091) |
| FeatureFlag | model | feature_flags | 9 | [schema:3111](../../../prisma/schema.prisma#L3111) |
| WebhookEvent | model | webhook_events | 13 | [schema:3135](../../../prisma/schema.prisma#L3135) |
| EmailTemplate | model | email_templates | 9 | [schema:3160](../../../prisma/schema.prisma#L3160) |
| Notification | model | notifications | 9 | [schema:3178](../../../prisma/schema.prisma#L3178) |
| PushSubscription | model | push_subscriptions | 8 | [schema:3200](../../../prisma/schema.prisma#L3200) |
| SavedJob | model | saved_jobs | 6 | [schema:3215](../../../prisma/schema.prisma#L3215) |
| WapJob | model | wap_jobs | 8 | [schema:3232](../../../prisma/schema.prisma#L3232) |
| TokenLinkType | enum | Prisma default | 3 | [schema:3251](../../../prisma/schema.prisma#L3251) |
| TokenizedLink | model | tokenized_link | 10 | [schema:3257](../../../prisma/schema.prisma#L3257) |
| UserTourState | model | user_tour_states | 9 | [schema:3280](../../../prisma/schema.prisma#L3280) |
