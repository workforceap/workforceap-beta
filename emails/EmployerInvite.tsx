import {
  Button,
  Heading,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import Layout from "./Layout";

interface EmployerInviteEmailProps {
  invitedBy?: string;
  invitedEmail?: string;
  inviteLink?: string;
  companyName?: string;
}

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.workforceap.org";

const EmployerInviteEmail = ({
  invitedBy = "The WorkforceAP Team",
  invitedEmail = "employer@example.com",
  inviteLink = `${baseUrl}/signup?type=employer`,
  companyName = "your organization",
}: EmployerInviteEmailProps) => {
  return (
    <Layout previewText={`Partner with WorkforceAP to access certified talent for ${companyName}`}>
      <Heading style={h1}>Welcome to the Employer Portal</Heading>
      
      <Text style={text}>
        <strong>{invitedBy}</strong> has invited {companyName} to join the Workforce Advancement Project as an Employer Partner.
      </Text>
      
      <Text style={text}>
        Through the Employer Portal, you can post open roles, review candidates with verified industry certifications, and build direct hiring pipelines with qualified talent in your area.
      </Text>
      
      <Section style={btnContainer}>
        <Button style={button} href={inviteLink}>
          Access Employer Portal
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
        If you have any questions about navigating the portal or creating job listings, our support team is ready to help.
      </Text>
      
      <Text style={text}>
        Best,<br />
        The WorkforceAP Team
      </Text>
    </Layout>
  );
};

export default EmployerInviteEmail;

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
