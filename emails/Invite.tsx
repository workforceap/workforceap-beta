import {
  Button,
  Heading,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import Layout from "./Layout";

interface InviteEmailProps {
  invitedBy?: string;
  invitedEmail?: string;
  inviteLink?: string;
  role?: string;
}

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.workforceap.org";

const InviteEmail = ({
  invitedBy = "Someone",
  invitedEmail = "you@example.com",
  inviteLink = `${baseUrl}/signup`,
  role = "Partner",
}: InviteEmailProps) => {
  return (
    <Layout previewText={`You have been invited to join WorkforceAP as a ${role}`}>
      <Heading style={h1}>Join WorkforceAP</Heading>
      
      <Text style={text}>
        <strong>{invitedBy}</strong> has invited you to join the Workforce Advancement Project as a <strong>{role}</strong>.
      </Text>
      
      <Text style={text}>
        We are building a coalition of employers, training providers, and counselors to help individuals gain valuable industry certifications and advance their careers.
      </Text>
      
      <Section style={btnContainer}>
        <Button style={button} href={inviteLink}>
          Accept Invitation
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
        If you did not expect this invitation, you can safely ignore this email.
      </Text>
      
      <Text style={text}>
        Best,<br />
        The WorkforceAP Team
      </Text>
    </Layout>
  );
};

export default InviteEmail;

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
