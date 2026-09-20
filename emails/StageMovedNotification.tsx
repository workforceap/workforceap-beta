import {
  Button,
  Heading,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import Layout from "./Layout";

interface StageMovedNotificationProps {
  memberName?: string;
  previousStage?: string;
  newStage?: string;
  actionUrl?: string;
  message?: string;
}

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.workforceap.org";

const StageMovedNotification = ({
  memberName = "Member",
  previousStage = "Application Review",
  newStage = "Enrolled",
  actionUrl = `${baseUrl}/dashboard`,
  message = "You are now officially enrolled in the program. Please log in to view your next steps and access the learning hub.",
}: StageMovedNotificationProps) => {
  return (
    <Layout previewText={`Status Update: You've moved to the ${newStage} stage`}>
      <Heading style={h1}>Status Update</Heading>
      
      <Text style={text}>
        Hi {memberName},
      </Text>
      
      <Text style={text}>
        Great news! Your WorkforceAP application status has been updated from <strong>{previousStage}</strong> to <strong style={{ color: "#ad2c4d" }}>{newStage}</strong>.
      </Text>
      
      <Text style={text}>
        {message}
      </Text>
      
      <Section style={btnContainer}>
        <Button style={button} href={actionUrl}>
          View My Status
        </Button>
      </Section>
      
      <Text style={text}>
        We're excited to support you in this next phase of your career journey!
      </Text>
      
      <Text style={text}>
        Best,<br />
        The WorkforceAP Team
      </Text>
    </Layout>
  );
};

export default StageMovedNotification;

const h1 = {
  color: "#1a1a1a",
  fontSize: "24px",
  fontWeight: "600",
  lineHeight: "32px",
  margin: "0 0 16px",
};

const text = {
  color: "#333333",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

const btnContainer = {
  margin: "24px 0",
};

const button = {
  backgroundColor: "#ad2c4d",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 24px",
};
