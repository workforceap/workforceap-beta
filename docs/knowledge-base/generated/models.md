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
| EmailSendLog | model | email_send_logs | 25 | [schema:909](../../../prisma/schema.prisma#L909) |
| CronExecution | model | cron_executions | 9 | [schema:950](../../../prisma/schema.prisma#L950) |
| WeeklyRecap | model | weekly_recaps | 12 | [schema:967](../../../prisma/schema.prisma#L967) |
| PathwayStepProgress | model | pathway_step_progress | 11 | [schema:987](../../../prisma/schema.prisma#L987) |
| TrainingAccessRequest | model | training_access_requests | 12 | [schema:1006](../../../prisma/schema.prisma#L1006) |
| TrainingAccessStatus | enum | Prisma default | 7 | [schema:1027](../../../prisma/schema.prisma#L1027) |
| AutomationRule | model | automation_rules | 9 | [schema:1037](../../../prisma/schema.prisma#L1037) |
| AIToolResult | model | ai_tool_results | 11 | [schema:1051](../../../prisma/schema.prisma#L1051) |
| CoachMemory | model | coach_memories | 6 | [schema:1076](../../../prisma/schema.prisma#L1076) |
| ApplicationAiFeedback | model | application_ai_feedback | 9 | [schema:1089](../../../prisma/schema.prisma#L1089) |
| ApplicationAiFeedbackHowUsed | enum | application_ai_feedback_how_used | 4 | [schema:1106](../../../prisma/schema.prisma#L1106) |
| AIToolType | enum | Prisma default | 15 | [schema:1115](../../../prisma/schema.prisma#L1115) |
| CertStatus | enum | cert_status | 3 | [schema:1133](../../../prisma/schema.prisma#L1133) |
| UserCertification | model | user_certifications | 11 | [schema:1141](../../../prisma/schema.prisma#L1141) |
| BlogPost | model | blog_posts | 14 | [schema:1167](../../../prisma/schema.prisma#L1167) |
| Partner | model | partners | 54 | [schema:1190](../../../prisma/schema.prisma#L1190) |
| PartnerProgramCatalog | model | partner_program_catalog | 8 | [schema:1277](../../../prisma/schema.prisma#L1277) |
| PartnerUser | model | partner_users | 6 | [schema:1293](../../../prisma/schema.prisma#L1293) |
| Counselor | model | counselors | 11 | [schema:1306](../../../prisma/schema.prisma#L1306) |
| CounselorAffiliation | enum | counselor_affiliations | 4 | [schema:1328](../../../prisma/schema.prisma#L1328) |
| CounselorAssignment | model | counselor_assignments | 8 | [schema:1339](../../../prisma/schema.prisma#L1339) |
| MessageThreadKind | enum | message_thread_kind | 3 | [schema:1359](../../../prisma/schema.prisma#L1359) |
| MessageThread | model | message_threads | 19 | [schema:1368](../../../prisma/schema.prisma#L1368) |
| Message | model | messages | 7 | [schema:1397](../../../prisma/schema.prisma#L1397) |
| PartnerReferral | model | partner_referrals | 8 | [schema:1412](../../../prisma/schema.prisma#L1412) |
| SubgroupType | enum | Prisma default | 3 | [schema:1432](../../../prisma/schema.prisma#L1432) |
| MemberSubgroupAssignmentType | enum | Prisma default | 3 | [schema:1438](../../../prisma/schema.prisma#L1438) |
| Subgroup | model | subgroups | 14 | [schema:1444](../../../prisma/schema.prisma#L1444) |
| MemberSubgroup | model | member_subgroups | 9 | [schema:1468](../../../prisma/schema.prisma#L1468) |
| SubgroupLeader | model | subgroup_leaders | 7 | [schema:1487](../../../prisma/schema.prisma#L1487) |
| PlacementRecord | model | placement_records | 21 | [schema:1512](../../../prisma/schema.prisma#L1512) |
| PlacedOutcome | model | placed_outcomes | 11 | [schema:1547](../../../prisma/schema.prisma#L1547) |
| PartnerSignupRequest | model | partner_signup_requests | 11 | [schema:1565](../../../prisma/schema.prisma#L1565) |
| CounselorNote | model | counselor_notes | 8 | [schema:1582](../../../prisma/schema.prisma#L1582) |
| AdvisorSessionNote | model | advisor_session_notes | 8 | [schema:1598](../../../prisma/schema.prisma#L1598) |
| AuditLog | model | audit_logs | 10 | [schema:1614](../../../prisma/schema.prisma#L1614) |
| AuditEvent | model | audit_events | 13 | [schema:1640](../../../prisma/schema.prisma#L1640) |
| WioaReviewSnapshot | model | wioa_review_snapshots | 16 | [schema:1679](../../../prisma/schema.prisma#L1679) |
| InvitationRole | enum | Prisma default | 4 | [schema:1712](../../../prisma/schema.prisma#L1712) |
| InvitationStatus | enum | Prisma default | 4 | [schema:1719](../../../prisma/schema.prisma#L1719) |
| Invitation | model | invitations | 19 | [schema:1726](../../../prisma/schema.prisma#L1726) |
| Employer | model | employers | 39 | [schema:1765](../../../prisma/schema.prisma#L1765) |
| EmployerHiringIntent | model | employer_hiring_intents | 11 | [schema:1817](../../../prisma/schema.prisma#L1817) |
| EmployerScreeningPack | model | employer_screening_packs | 8 | [schema:1837](../../../prisma/schema.prisma#L1837) |
| EmployerSubscription | model | employer_subscriptions | 14 | [schema:1853](../../../prisma/schema.prisma#L1853) |
| JobLocationType | enum | job_location_type | 3 | [schema:1876](../../../prisma/schema.prisma#L1876) |
| JobTypeEnum | enum | job_type_enum | 3 | [schema:1884](../../../prisma/schema.prisma#L1884) |
| JobStatusEnum | enum | job_status_enum | 6 | [schema:1892](../../../prisma/schema.prisma#L1892) |
| Job | model | jobs | 37 | [schema:1903](../../../prisma/schema.prisma#L1903) |
| OrganizationProgramCatalog | model | organization_program_catalog | 23 | [schema:1952](../../../prisma/schema.prisma#L1952) |
| Course | model | courses | 14 | [schema:1989](../../../prisma/schema.prisma#L1989) |
| CourseEnrollment | model | course_enrollments | 19 | [schema:2011](../../../prisma/schema.prisma#L2011) |
| TrainingBillingPacket | model | training_billing_packets | 29 | [schema:2064](../../../prisma/schema.prisma#L2064) |
| XapiStatement | model | xapi_statements | 20 | [schema:2108](../../../prisma/schema.prisma#L2108) |
| CourseProgressStatus | enum | course_progress_status | 3 | [schema:2164](../../../prisma/schema.prisma#L2164) |
| CourseProgress | model | course_progress | 17 | [schema:2173](../../../prisma/schema.prisma#L2173) |
| MemberProgramProgress | model | member_program_progress | 8 | [schema:2206](../../../prisma/schema.prisma#L2206) |
| PreScreeningResponse | model | pre_screening_responses | 13 | [schema:2222](../../../prisma/schema.prisma#L2222) |
| PreScreeningDraft | model | pre_screening_drafts | 13 | [schema:2243](../../../prisma/schema.prisma#L2243) |
| ApplyEligibilityScreening | model | apply_eligibility_screenings | 20 | [schema:2262](../../../prisma/schema.prisma#L2262) |
| PublicWioaScreening | model | public_wioa_screenings | 9 | [schema:2298](../../../prisma/schema.prisma#L2298) |
| JobPostingApplicationStatus | enum | job_posting_application_status | 6 | [schema:2315](../../../prisma/schema.prisma#L2315) |
| JobPostingApplication | model | job_posting_applications | 18 | [schema:2326](../../../prisma/schema.prisma#L2326) |
| ApplicationMessage | model | application_messages | 8 | [schema:2354](../../../prisma/schema.prisma#L2354) |
| PartnerOutreachLog | model | partner_outreach_logs | 10 | [schema:2370](../../../prisma/schema.prisma#L2370) |
| PortalWorkflowEvent | model | portal_workflow_events | 14 | [schema:2389](../../../prisma/schema.prisma#L2389) |
| AIJobMatchStatus | enum | ai_job_match_status | 7 | [schema:2412](../../../prisma/schema.prisma#L2412) |
| AIJobMatch | model | ai_job_matches | 10 | [schema:2424](../../../prisma/schema.prisma#L2424) |
| MentorSpecialty | model | mentor_specialties | 4 | [schema:2445](../../../prisma/schema.prisma#L2445) |
| Mentor | model | mentors | 17 | [schema:2456](../../../prisma/schema.prisma#L2456) |
| MentorSession | model | mentor_sessions | 13 | [schema:2479](../../../prisma/schema.prisma#L2479) |
| MentorSessionStatus | enum | Prisma default | 4 | [schema:2500](../../../prisma/schema.prisma#L2500) |
| CareerExperienceBand | enum | career_experience_band | 3 | [schema:2509](../../../prisma/schema.prisma#L2509) |
| CareerRecommendationType | enum | career_recommendation_type | 3 | [schema:2517](../../../prisma/schema.prisma#L2517) |
| OnetOccupation | model | onet_occupations | 21 | [schema:2525](../../../prisma/schema.prisma#L2525) |
| OnetOccupationSkill | model | onet_occupation_skills | 6 | [schema:2552](../../../prisma/schema.prisma#L2552) |
| OnetOccupationTask | model | onet_occupation_tasks | 5 | [schema:2565](../../../prisma/schema.prisma#L2565) |
| OnetOccupationTech | model | onet_occupation_tech | 5 | [schema:2577](../../../prisma/schema.prisma#L2577) |
| OnetRelatedOccupation | model | onet_related_occupations | 6 | [schema:2589](../../../prisma/schema.prisma#L2589) |
| CareerProgramMapping | model | career_program_mappings | 11 | [schema:2603](../../../prisma/schema.prisma#L2603) |
| CareerQuizRule | model | career_quiz_rules | 9 | [schema:2623](../../../prisma/schema.prisma#L2623) |
| MemberNextBestAction | model | member_next_best_actions | 12 | [schema:2637](../../../prisma/schema.prisma#L2637) |
| MemberPoints | model | member_points | 10 | [schema:2658](../../../prisma/schema.prisma#L2658) |
| PointsTransaction | model | points_transactions | 10 | [schema:2675](../../../prisma/schema.prisma#L2675) |
| ReferralCode | model | referral_codes | 5 | [schema:2699](../../../prisma/schema.prisma#L2699) |
| ReferralConversion | model | referral_conversions | 9 | [schema:2713](../../../prisma/schema.prisma#L2713) |
| CourseraCourseProgress | model | coursera_course_progress | 29 | [schema:2737](../../../prisma/schema.prisma#L2737) |
| CourseraCanonicalCourseMapping | model | coursera_canonical_course_mappings | 10 | [schema:2791](../../../prisma/schema.prisma#L2791) |
| CourseraCurriculumCourseMapping | model | coursera_curriculum_course_mappings | 9 | [schema:2814](../../../prisma/schema.prisma#L2814) |
| CourseraIdentityMapping | model | coursera_identity_mappings | 11 | [schema:2843](../../../prisma/schema.prisma#L2843) |
| CourseraBadgeProgress | model | coursera_badge_progress | 21 | [schema:2867](../../../prisma/schema.prisma#L2867) |
| AtRiskAlert | model | at_risk_alerts | 13 | [schema:2903](../../../prisma/schema.prisma#L2903) |
| MemberNudgeLog | model | member_nudge_logs | 7 | [schema:2929](../../../prisma/schema.prisma#L2929) |
| PlacementSurveyWave | enum | placement_survey_wave | 4 | [schema:2945](../../../prisma/schema.prisma#L2945) |
| PlacementSurvey | model | placement_surveys | 21 | [schema:2962](../../../prisma/schema.prisma#L2962) |
| TestimonialSource | enum | testimonial_source | 3 | [schema:3006](../../../prisma/schema.prisma#L3006) |
| TestimonialStatus | enum | testimonial_status | 4 | [schema:3014](../../../prisma/schema.prisma#L3014) |
| Testimonial | model | testimonials | 18 | [schema:3023](../../../prisma/schema.prisma#L3023) |
| CourseraSkillsetProgress | model | coursera_skillset_progress | 9 | [schema:3057](../../../prisma/schema.prisma#L3057) |
| MilestoneCascade | model | milestone_cascades | 23 | [schema:3084](../../../prisma/schema.prisma#L3084) |
| MemberFeedback | model | member_feedback | 8 | [schema:3130](../../../prisma/schema.prisma#L3130) |
| FeatureFlag | model | feature_flags | 9 | [schema:3150](../../../prisma/schema.prisma#L3150) |
| WebhookEvent | model | webhook_events | 13 | [schema:3174](../../../prisma/schema.prisma#L3174) |
| EmailTemplate | model | email_templates | 9 | [schema:3199](../../../prisma/schema.prisma#L3199) |
| Notification | model | notifications | 9 | [schema:3217](../../../prisma/schema.prisma#L3217) |
| PushSubscription | model | push_subscriptions | 8 | [schema:3239](../../../prisma/schema.prisma#L3239) |
| SavedJob | model | saved_jobs | 6 | [schema:3254](../../../prisma/schema.prisma#L3254) |
| WapJob | model | wap_jobs | 8 | [schema:3271](../../../prisma/schema.prisma#L3271) |
| TokenLinkType | enum | Prisma default | 3 | [schema:3290](../../../prisma/schema.prisma#L3290) |
| TokenizedLink | model | tokenized_link | 10 | [schema:3296](../../../prisma/schema.prisma#L3296) |
| UserTourState | model | user_tour_states | 9 | [schema:3319](../../../prisma/schema.prisma#L3319) |
