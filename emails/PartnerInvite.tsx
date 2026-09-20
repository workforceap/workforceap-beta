import {
  Button,
  Heading,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import Layout from "./Layout";

interface PartnerInviteEmailProps {
  invitedBy?: string;
  invitedEmail?: string;
  inviteLink?: string;
  organizationName?: string;
}

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.workforceap.org";

const PartnerInviteEmail = ({
  invitedBy = "The WorkforceAP Team",
  invitedEmail = "partner@example.com",
  inviteLink = `${baseUrl}/signup?type=partner`,
  organizationName = "your organization",
}: PartnerInviteEmailProps) => {
  return (
    <Layout previewText={`Join WorkforceAP as a Partner to track referrals and progress`}>
      <Heading style={h1}>Welcome to the Partner Portal</Heading>
      
      <Text style={text}>
        <strong>{invitedBy}</strong> has invited {organizationName} to join the Workforce Advancement Project as an Organizational Partner.
      </Text>
      
      <Text style={text}>
        The Partner Portal empowers you to refer individuals to our training programs, monitor their certification progress, and access accountability views for your cohorts.
      </Text>
      
      <Section style={btnContainer}>
        <Button style={button} href={inviteLink}>
          Access Partner Portal
        </Button>
      </Section>
      
      <Text style={text}>
        Or, copy and paste this link into your browser:
      </Text>
      
      <Text style={linkText}>
        <a href={inviteLink} style={link}>
          {inviteLink}
        </a>
      </Text>
      
      <Text style={text}>
        We look forward to collaborating with you to empower individuals through industry-recognized credentials.
      </Text>
      
      <Text style={text}>
        Best,<br />
        The WorkforceAP Team
      </Text>
    </Layout>
  );
};

export default PartnerInviteEmail;

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

const linkText = {
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

const link = {
  color: "#ad2c4d",
  textDecoration: "underline",
  wordBreak: "break-all" as const,
};
