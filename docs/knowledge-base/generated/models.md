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
| CspViolationBucket | model | csp_violation_buckets | 9 | [schema:881](../../../prisma/schema.prisma#L881) |
| EmailSendLog | model | email_send_logs | 25 | [schema:910](../../../prisma/schema.prisma#L910) |
| CronExecution | model | cron_executions | 9 | [schema:951](../../../prisma/schema.prisma#L951) |
| WeeklyRecap | model | weekly_recaps | 12 | [schema:968](../../../prisma/schema.prisma#L968) |
| PathwayStepProgress | model | pathway_step_progress | 11 | [schema:988](../../../prisma/schema.prisma#L988) |
| TrainingAccessRequest | model | training_access_requests | 12 | [schema:1007](../../../prisma/schema.prisma#L1007) |
| TrainingAccessStatus | enum | Prisma default | 7 | [schema:1028](../../../prisma/schema.prisma#L1028) |
| AutomationRule | model | automation_rules | 9 | [schema:1038](../../../prisma/schema.prisma#L1038) |
| AIToolResult | model | ai_tool_results | 11 | [schema:1052](../../../prisma/schema.prisma#L1052) |
| CoachMemory | model | coach_memories | 6 | [schema:1077](../../../prisma/schema.prisma#L1077) |
| ApplicationAiFeedback | model | application_ai_feedback | 9 | [schema:1090](../../../prisma/schema.prisma#L1090) |
| ApplicationAiFeedbackHowUsed | enum | application_ai_feedback_how_used | 4 | [schema:1107](../../../prisma/schema.prisma#L1107) |
| AIToolType | enum | Prisma default | 15 | [schema:1116](../../../prisma/schema.prisma#L1116) |
| CertStatus | enum | cert_status | 3 | [schema:1134](../../../prisma/schema.prisma#L1134) |
| UserCertification | model | user_certifications | 11 | [schema:1142](../../../prisma/schema.prisma#L1142) |
| BlogPost | model | blog_posts | 14 | [schema:1168](../../../prisma/schema.prisma#L1168) |
| Partner | model | partners | 54 | [schema:1191](../../../prisma/schema.prisma#L1191) |
| PartnerProgramCatalog | model | partner_program_catalog | 8 | [schema:1278](../../../prisma/schema.prisma#L1278) |
| PartnerUser | model | partner_users | 6 | [schema:1294](../../../prisma/schema.prisma#L1294) |
| Counselor | model | counselors | 11 | [schema:1307](../../../prisma/schema.prisma#L1307) |
| CounselorAffiliation | enum | counselor_affiliations | 4 | [schema:1329](../../../prisma/schema.prisma#L1329) |
| CounselorAssignment | model | counselor_assignments | 8 | [schema:1340](../../../prisma/schema.prisma#L1340) |
| MessageThreadKind | enum | message_thread_kind | 3 | [schema:1360](../../../prisma/schema.prisma#L1360) |
| MessageThread | model | message_threads | 19 | [schema:1369](../../../prisma/schema.prisma#L1369) |
| Message | model | messages | 7 | [schema:1398](../../../prisma/schema.prisma#L1398) |
| PartnerReferral | model | partner_referrals | 8 | [schema:1413](../../../prisma/schema.prisma#L1413) |
| SubgroupType | enum | Prisma default | 3 | [schema:1433](../../../prisma/schema.prisma#L1433) |
| MemberSubgroupAssignmentType | enum | Prisma default | 3 | [schema:1439](../../../prisma/schema.prisma#L1439) |
| Subgroup | model | subgroups | 14 | [schema:1445](../../../prisma/schema.prisma#L1445) |
| MemberSubgroup | model | member_subgroups | 9 | [schema:1469](../../../prisma/schema.prisma#L1469) |
| SubgroupLeader | model | subgroup_leaders | 7 | [schema:1488](../../../prisma/schema.prisma#L1488) |
| PlacementRecord | model | placement_records | 21 | [schema:1513](../../../prisma/schema.prisma#L1513) |
| PlacedOutcome | model | placed_outcomes | 11 | [schema:1548](../../../prisma/schema.prisma#L1548) |
| PartnerSignupRequest | model | partner_signup_requests | 11 | [schema:1566](../../../prisma/schema.prisma#L1566) |
| CounselorNote | model | counselor_notes | 8 | [schema:1583](../../../prisma/schema.prisma#L1583) |
| AdvisorSessionNote | model | advisor_session_notes | 8 | [schema:1599](../../../prisma/schema.prisma#L1599) |
| AuditLog | model | audit_logs | 10 | [schema:1615](../../../prisma/schema.prisma#L1615) |
| AuditEvent | model | audit_events | 13 | [schema:1641](../../../prisma/schema.prisma#L1641) |
| WioaReviewSnapshot | model | wioa_review_snapshots | 16 | [schema:1680](../../../prisma/schema.prisma#L1680) |
| InvitationRole | enum | Prisma default | 4 | [schema:1713](../../../prisma/schema.prisma#L1713) |
| InvitationStatus | enum | Prisma default | 4 | [schema:1720](../../../prisma/schema.prisma#L1720) |
| Invitation | model | invitations | 19 | [schema:1727](../../../prisma/schema.prisma#L1727) |
| Employer | model | employers | 39 | [schema:1766](../../../prisma/schema.prisma#L1766) |
| EmployerHiringIntent | model | employer_hiring_intents | 11 | [schema:1818](../../../prisma/schema.prisma#L1818) |
| EmployerScreeningPack | model | employer_screening_packs | 8 | [schema:1838](../../../prisma/schema.prisma#L1838) |
| EmployerSubscription | model | employer_subscriptions | 14 | [schema:1854](../../../prisma/schema.prisma#L1854) |
| JobLocationType | enum | job_location_type | 3 | [schema:1877](../../../prisma/schema.prisma#L1877) |
| JobTypeEnum | enum | job_type_enum | 3 | [schema:1885](../../../prisma/schema.prisma#L1885) |
| JobStatusEnum | enum | job_status_enum | 6 | [schema:1893](../../../prisma/schema.prisma#L1893) |
| Job | model | jobs | 37 | [schema:1904](../../../prisma/schema.prisma#L1904) |
| OrganizationProgramCatalog | model | organization_program_catalog | 23 | [schema:1953](../../../prisma/schema.prisma#L1953) |
| Course | model | courses | 14 | [schema:1990](../../../prisma/schema.prisma#L1990) |
| CourseEnrollment | model | course_enrollments | 19 | [schema:2012](../../../prisma/schema.prisma#L2012) |
| TrainingBillingPacket | model | training_billing_packets | 29 | [schema:2065](../../../prisma/schema.prisma#L2065) |
| XapiStatement | model | xapi_statements | 20 | [schema:2109](../../../prisma/schema.prisma#L2109) |
| CourseProgressStatus | enum | course_progress_status | 3 | [schema:2165](../../../prisma/schema.prisma#L2165) |
| CourseProgress | model | course_progress | 17 | [schema:2174](../../../prisma/schema.prisma#L2174) |
| MemberProgramProgress | model | member_program_progress | 8 | [schema:2207](../../../prisma/schema.prisma#L2207) |
| PreScreeningResponse | model | pre_screening_responses | 13 | [schema:2223](../../../prisma/schema.prisma#L2223) |
| PreScreeningDraft | model | pre_screening_drafts | 13 | [schema:2244](../../../prisma/schema.prisma#L2244) |
| ApplyEligibilityScreening | model | apply_eligibility_screenings | 20 | [schema:2263](../../../prisma/schema.prisma#L2263) |
| PublicWioaScreening | model | public_wioa_screenings | 9 | [schema:2302](../../../prisma/schema.prisma#L2302) |
| JobPostingApplicationStatus | enum | job_posting_application_status | 6 | [schema:2319](../../../prisma/schema.prisma#L2319) |
| JobPostingApplication | model | job_posting_applications | 18 | [schema:2330](../../../prisma/schema.prisma#L2330) |
| ApplicationMessage | model | application_messages | 8 | [schema:2358](../../../prisma/schema.prisma#L2358) |
| PartnerOutreachLog | model | partner_outreach_logs | 10 | [schema:2374](../../../prisma/schema.prisma#L2374) |
| PortalWorkflowEvent | model | portal_workflow_events | 14 | [schema:2393](../../../prisma/schema.prisma#L2393) |
| AIJobMatchStatus | enum | ai_job_match_status | 7 | [schema:2416](../../../prisma/schema.prisma#L2416) |
| AIJobMatch | model | ai_job_matches | 10 | [schema:2428](../../../prisma/schema.prisma#L2428) |
| MentorSpecialty | model | mentor_specialties | 4 | [schema:2449](../../../prisma/schema.prisma#L2449) |
| Mentor | model | mentors | 17 | [schema:2460](../../../prisma/schema.prisma#L2460) |
| MentorSession | model | mentor_sessions | 13 | [schema:2483](../../../prisma/schema.prisma#L2483) |
| MentorSessionStatus | enum | Prisma default | 4 | [schema:2504](../../../prisma/schema.prisma#L2504) |
| CareerExperienceBand | enum | career_experience_band | 3 | [schema:2513](../../../prisma/schema.prisma#L2513) |
| CareerRecommendationType | enum | career_recommendation_type | 3 | [schema:2521](../../../prisma/schema.prisma#L2521) |
| OnetOccupation | model | onet_occupations | 21 | [schema:2529](../../../prisma/schema.prisma#L2529) |
| OnetOccupationSkill | model | onet_occupation_skills | 6 | [schema:2556](../../../prisma/schema.prisma#L2556) |
| OnetOccupationTask | model | onet_occupation_tasks | 5 | [schema:2569](../../../prisma/schema.prisma#L2569) |
| OnetOccupationTech | model | onet_occupation_tech | 5 | [schema:2581](../../../prisma/schema.prisma#L2581) |
| OnetRelatedOccupation | model | onet_related_occupations | 6 | [schema:2593](../../../prisma/schema.prisma#L2593) |
| CareerProgramMapping | model | career_program_mappings | 11 | [schema:2607](../../../prisma/schema.prisma#L2607) |
| CareerQuizRule | model | career_quiz_rules | 9 | [schema:2627](../../../prisma/schema.prisma#L2627) |
| MemberNextBestAction | model | member_next_best_actions | 12 | [schema:2641](../../../prisma/schema.prisma#L2641) |
| MemberPoints | model | member_points | 10 | [schema:2662](../../../prisma/schema.prisma#L2662) |
| PointsTransaction | model | points_transactions | 10 | [schema:2679](../../../prisma/schema.prisma#L2679) |
| ReferralCode | model | referral_codes | 5 | [schema:2703](../../../prisma/schema.prisma#L2703) |
| ReferralConversion | model | referral_conversions | 9 | [schema:2717](../../../prisma/schema.prisma#L2717) |
| CourseraCourseProgress | model | coursera_course_progress | 29 | [schema:2741](../../../prisma/schema.prisma#L2741) |
| CourseraCanonicalCourseMapping | model | coursera_canonical_course_mappings | 10 | [schema:2795](../../../prisma/schema.prisma#L2795) |
| CourseraCurriculumCourseMapping | model | coursera_curriculum_course_mappings | 9 | [schema:2818](../../../prisma/schema.prisma#L2818) |
| CourseraIdentityMapping | model | coursera_identity_mappings | 11 | [schema:2847](../../../prisma/schema.prisma#L2847) |
| CourseraBadgeProgress | model | coursera_badge_progress | 21 | [schema:2871](../../../prisma/schema.prisma#L2871) |
| AtRiskAlert | model | at_risk_alerts | 13 | [schema:2907](../../../prisma/schema.prisma#L2907) |
| MemberNudgeLog | model | member_nudge_logs | 7 | [schema:2933](../../../prisma/schema.prisma#L2933) |
| PlacementSurveyWave | enum | placement_survey_wave | 4 | [schema:2949](../../../prisma/schema.prisma#L2949) |
| PlacementSurvey | model | placement_surveys | 21 | [schema:2966](../../../prisma/schema.prisma#L2966) |
| TestimonialSource | enum | testimonial_source | 3 | [schema:3010](../../../prisma/schema.prisma#L3010) |
| TestimonialStatus | enum | testimonial_status | 4 | [schema:3018](../../../prisma/schema.prisma#L3018) |
| Testimonial | model | testimonials | 18 | [schema:3027](../../../prisma/schema.prisma#L3027) |
| CourseraSkillsetProgress | model | coursera_skillset_progress | 9 | [schema:3061](../../../prisma/schema.prisma#L3061) |
| MilestoneCascade | model | milestone_cascades | 23 | [schema:3088](../../../prisma/schema.prisma#L3088) |
| MemberFeedback | model | member_feedback | 8 | [schema:3134](../../../prisma/schema.prisma#L3134) |
| FeatureFlag | model | feature_flags | 9 | [schema:3154](../../../prisma/schema.prisma#L3154) |
| WebhookEvent | model | webhook_events | 13 | [schema:3178](../../../prisma/schema.prisma#L3178) |
| EmailTemplate | model | email_templates | 9 | [schema:3203](../../../prisma/schema.prisma#L3203) |
| Notification | model | notifications | 9 | [schema:3221](../../../prisma/schema.prisma#L3221) |
| PushSubscription | model | push_subscriptions | 8 | [schema:3243](../../../prisma/schema.prisma#L3243) |
| SavedJob | model | saved_jobs | 6 | [schema:3258](../../../prisma/schema.prisma#L3258) |
| WapJob | model | wap_jobs | 8 | [schema:3275](../../../prisma/schema.prisma#L3275) |
| TokenLinkType | enum | Prisma default | 3 | [schema:3294](../../../prisma/schema.prisma#L3294) |
| TokenizedLink | model | tokenized_link | 10 | [schema:3300](../../../prisma/schema.prisma#L3300) |
| UserTourState | model | user_tour_states | 9 | [schema:3323](../../../prisma/schema.prisma#L3323) |
