import {
  Button,
  Heading,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import Layout from "./Layout";

interface CourseStartNotificationProps {
  memberName?: string;
  courseName?: string;
  actionUrl?: string;
  deadline?: string;
}

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.workforceap.org";

const CourseStartNotification = ({
  memberName = "Member",
  courseName = "Digital Literacy Fundamentals",
  actionUrl = `${baseUrl}/dashboard/learning`,
  deadline = "Next Monday",
}: CourseStartNotificationProps) => {
  return (
    <Layout previewText={`It's time to start your coursework: ${courseName}`}>
      <Heading style={h1}>Ready to Begin?</Heading>
      
      <Text style={text}>
        Hi {memberName},
      </Text>
      
      <Text style={text}>
        Your training materials for <strong>{courseName}</strong> are now unlocked and ready for you. To stay on track with your cohort, please log in and begin your coursework.
      </Text>
      
      <Section style={btnContainer}>
        <Button style={button} href={actionUrl}>
          Start Coursework
        </Button>
      </Section>
      
      <Text style={text}>
        <strong>Recommended target:</strong> Try to complete the first module by {deadline} to ensure you have enough time for the final assessment.
      </Text>

      <Text style={text}>
        If you need help or have questions about the materials, reach out to your counselor through the portal.
      </Text>
      
      <Text style={text}>
        Best,<br />
        The WorkforceAP Team
      </Text>
    </Layout>
  );
};

export default CourseStartNotification;

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
