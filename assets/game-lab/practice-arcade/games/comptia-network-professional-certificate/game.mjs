export default {
  id: 'comptia-network-professional-certificate',
  title: 'Route Runner',
  tagline: 'Short practice runs for new network techs.',
  role: 'You are the network tech at Larkspur Freight, keeping the office network up and running.',
  program: 'CompTIA Network+ Professional Certificate',
  theme: {world: 'server-room', accent: '#2f8f4e', mood: 'dusk'},
  levels: [
    {
      id: 'layer-sort', order: 1,
      courseSlug: 'comptia-network-course-1', courseTitle: 'Introduction to Networking',
      title: 'Layer Sort',
      skill: 'Placing network parts and data on the right OSI layer',
      mechanic: 'sort', prop: 'packet',
      scene: 'Your manager at Larkspur Freight asks how data moves. You sort what you see in the rack by OSI layer.',
      takeaway: 'Layer 1 moves raw signals, Layer 2 uses MAC addresses, Layer 3 uses IP addresses, and Layer 4 uses ports to reach the right program.',
      prompt: 'Which OSI layer does this belong to?',
      bins: [
        {id: 'physical', label: '1 Physical'},
        {id: 'datalink', label: '2 Data Link'},
        {id: 'network', label: '3 Network'},
        {id: 'transport', label: '4 Transport'}
      ],
      items: [
        {label: 'Copper cable carrying signals', answer: 'physical', why: 'Layer 1 is the physical path: cables, connectors and the electrical signals that carry raw bits.'},
        {label: 'Fiber carrying light pulses', answer: 'physical', why: 'Fiber sends bits as pulses of light. The medium and the signal are both Layer 1.'},
        {label: 'Switch reading MAC addresses', answer: 'datalink', why: 'A switch learns which MAC address sits on which port and sends frames only there. That is Layer 2 work.'},
        {label: 'Frame with both MAC addresses', answer: 'datalink', why: 'Data at Layer 2 is called a frame, and its header carries the MAC addresses of the two devices on the local link.'},
        {label: 'Router picking a path by IP', answer: 'network', why: 'Routers read the destination IP address to choose where to send a packet next. IP routing is Layer 3.'},
        {label: 'IP address 192.0.2.15', answer: 'network', why: 'IP addresses are logical addresses used to reach hosts across networks, which is the job of Layer 3.'},
        {label: 'TCP numbering segments', answer: 'transport', why: 'TCP splits data into segments and numbers them so they can be put back in order. That is Layer 4.'},
        {label: 'Port 25 for incoming mail', answer: 'transport', why: 'Port numbers tell the receiving computer which program gets the data. Ports belong to Layer 4.'}
      ]
    },
    {
      id: 'whats-broken', order: 2,
      courseSlug: 'comptia-network-course-2', courseTitle: 'Networking Fundamentals',
      title: "What's Broken?",
      skill: 'Telling DNS, DHCP and default gateway problems apart',
      mechanic: 'gate', prop: 'ticket',
      scene: 'Help tickets pile up after a busy Monday at Larkspur Freight. Each one points to DNS, DHCP or the default gateway.',
      takeaway: 'Names fail but IPs work: DNS. No address or a 169.254 address: DHCP. Local works but nothing outside: the default gateway.',
      prompt: 'Which setting is most likely the problem?',
      actions: [
        {id: 'dns', label: 'DNS'},
        {id: 'dhcp', label: 'DHCP'},
        {id: 'gateway', label: 'Default gateway'}
      ],
      items: [
        {title: 'Sites fail by name, work by IP', facts: ['ping 203.0.113.10 gets replies', 'Typing shop.example in a browser fails'], answer: 'dns', why: 'If an IP address works but the name does not, the path is fine. The computer cannot turn names into addresses, which is DNS.'},
        {title: 'Laptop has a 169.254.x.x address', facts: ['Other laptops get 192.0.2.x addresses', 'It cannot reach anything'], answer: 'dhcp', why: 'A computer gives itself a 169.254 address when no DHCP server answers. Check that it can reach the DHCP server.'},
        {title: 'Printer works, internet does not', facts: ['Prints fine to 192.0.2.50 on the LAN', 'Default gateway field is blank'], answer: 'gateway', why: 'Local traffic needs no router. To leave the network a computer needs a default gateway, and this one has none.'},
        {title: 'New PCs get no address today', facts: ['PCs set up last week work fine', 'DHCP pool has no free addresses left'], answer: 'dhcp', why: 'DHCP hands out addresses from a pool. When the pool is used up, new devices get nothing until you grow it or free leases.'},
        {title: 'Only local devices answer', facts: ['Gateway is set to 192.0.2.99', 'The router is really at 192.0.2.1'], answer: 'gateway', why: 'Traffic for other networks goes to the gateway. Pointing it at an address with no router means that traffic goes nowhere.'},
        {title: 'No name lookups work at all', facts: ['DNS server is set to 192.0.2.250', 'No device uses that address'], answer: 'dns', why: 'Name lookups go to the DNS server address. If nothing is there, every lookup fails. Point it at a working DNS server.'},
        {title: 'Whole floor lost addresses', facts: ['DHCP server was shut down for repair', 'Leases ran out over the weekend'], answer: 'dhcp', why: 'A PC must renew its DHCP lease before it runs out. With the server off, nobody answers, so the address expires and the PC has no usable one.'}
      ]
    },
    {
      id: 'command-line-dash', order: 3,
      courseSlug: 'comptia-network-course-3', courseTitle: 'Introduction to Contemporary Operating Systems and Hardware',
      title: 'Command Line Dash',
      skill: 'Picking the right network command on Windows or Linux',
      mechanic: 'lane', prop: 'code-block',
      scene: 'A Linux web server and a Windows file server will not talk. You open a terminal on each one.',
      takeaway: 'Windows and Linux do the same checks with different commands: ipconfig or ip addr, tracert or traceroute. nslookup works on both.',
      questions: [
        {prompt: 'On a Windows PC, you want to see its IP address and gateway.', options: ['ipconfig', 'tracert', 'nslookup'], answer: 0, why: 'ipconfig shows the Windows network settings, including the IP address, mask and default gateway.'},
        {prompt: 'On a Linux server, you want to see the IP address on each interface.', options: ['ipconfig /all', 'ip addr', 'tracert'], answer: 1, why: 'On Linux, ip addr lists each network interface with its addresses. ipconfig and tracert are Windows commands.'},
        {prompt: 'In the Windows command prompt, you want to see each router hop to a server.', options: ['ping', 'ipconfig', 'tracert'], answer: 2, why: 'tracert lists every router the traffic passes through. ping only tells you if the far end replies.'},
        {prompt: 'On Linux, you want to see each router hop to a server.', options: ['traceroute', 'tracert', 'ip addr'], answer: 0, why: 'Linux uses traceroute for this. tracert is the Windows name for the same idea.'},
        {prompt: 'On either system, you want the IP address for the name files.example.', options: ['ipconfig', 'nslookup', 'ip link'], answer: 1, why: 'nslookup asks a DNS server for the address that goes with a name. It works on Windows and Linux.'},
        {prompt: 'Linux shows interface em1 as state DOWN. You want to turn it on.', options: ['ping em1', 'ipconfig /renew', 'ip link set em1 up'], answer: 2, why: 'ip link set em1 up turns the interface on. ping only tests a reply, and ipconfig is a Windows command.'},
        {prompt: 'A Windows PC keeps going to an old address for a name. You want to clear saved lookups.', options: ['ipconfig /flushdns', 'tracert', 'ping'], answer: 0, why: 'Windows saves recent DNS answers. ipconfig /flushdns clears them so the next lookup asks the DNS server again.'},
        {prompt: 'From Linux, you want to know if TCP port 443 is open on server s1.', options: ['ping', 'nc -zv s1 443', 'nslookup'], answer: 1, why: 'nc -zv tries a TCP connection to that one port and reports the result. ping does not test ports at all.'}
      ]
    },
    {
      id: 'storage-sort', order: 4,
      courseSlug: 'comptia-network-course-4', courseTitle: 'Introduction to Networking and Storage',
      title: 'Storage Sort',
      skill: 'Telling NAS, SAN and direct-attached storage apart',
      mechanic: 'sort', prop: 'database-cylinder',
      scene: 'Larkspur Freight wants shared storage. You walk the server room and label every storage setup you find.',
      takeaway: 'DAS plugs into one computer. A NAS shares files over the normal network. A SAN gives servers block storage, like a local disk.',
      prompt: 'What kind of storage is this?',
      bins: [
        {id: 'das', label: 'DAS'},
        {id: 'nas', label: 'NAS'},
        {id: 'san', label: 'SAN'}
      ],
      items: [
        {label: 'USB drive plugged into one PC', answer: 'das', why: 'Direct-attached storage (DAS) connects straight to one computer, with no network in between.'},
        {label: 'Drive inside a server case', answer: 'das', why: 'An internal drive belongs to that one server. It is direct-attached, not shared over a network.'},
        {label: 'Disk box cabled to one server', note: 'Uses a SAS cable, no switch', answer: 'das', why: 'A disk shelf cabled straight to a single server is still DAS. Only that server can use it.'},
        {label: 'Box on Ethernet sharing folders', note: 'Staff open it over SMB', answer: 'nas', why: 'Network-attached storage (NAS) shares files and folders over the normal network using file protocols like SMB.'},
        {label: 'Appliance serving NFS shares', note: 'Linux users mount its folders', answer: 'nas', why: 'NFS is a file-sharing protocol. A device that hands out folders this way gives file-level access, which is NAS.'},
        {label: 'Share at \\\\files.example\\hr', note: 'Opened by path in File Explorer', answer: 'nas', why: 'A path like \\\\server\\share points to a shared folder on the network. File-level sharing over the LAN is what a NAS does.'},
        {label: 'Fibre Channel storage network', note: 'Servers see raw disks', answer: 'san', why: 'A storage area network (SAN) gives servers block-level disks, often over a separate Fibre Channel network.'},
        {label: 'iSCSI disk for a database server', note: 'Shows up as a local, blank disk', answer: 'san', why: 'iSCSI carries block storage over IP. The server formats the disk itself, which is how a SAN works.'},
        {label: 'Shared block storage for VMs', note: 'On its own storage network', answer: 'san', why: 'Virtual machine hosts often share block storage on a dedicated network. That pooled block storage is a SAN.'}
      ]
    },
    {
      id: 'switch-setup', order: 5,
      courseSlug: 'comptia-network-course-5', courseTitle: 'Basics of Cisco Networking',
      title: 'Switch Setup',
      skill: 'Putting Cisco IOS steps for a VLAN in the right order',
      mechanic: 'order', prop: 'clipboard',
      scene: 'HR and Shipping must not see each other\'s traffic. A new Cisco switch waits on your bench.',
      takeaway: 'Climb the IOS modes in order, create the VLAN before you use it, put the port in it, then save so it survives a restart.',
      rounds: [
        {prompt: 'Put the IOS prompts in the order you pass through them to set up a port.', steps: ['Switch> (user EXEC)', 'Switch# (privileged EXEC)', 'Switch(config)# (global config)', 'Switch(config-if)# (interface)'], why: 'IOS modes are layered. enable takes you to privileged mode, configure terminal to global config, and interface to one port.'},
        {prompt: 'Create VLAN 20 for HR. You start at Switch>.', steps: ['enable', 'configure terminal', 'vlan 20', 'name HR', 'end'], why: 'You must be in global config to create a VLAN. The name command only works inside that VLAN, and end takes you back out.'},
        {prompt: 'Put port Fa0/5 in VLAN 20 and save. You start at Switch#.', steps: ['configure terminal', 'interface fa0/5', 'switchport access vlan 20', 'end', 'copy running-config startup-config'], why: 'Pick the port before you set its VLAN. Saving copies the running setup to startup so it is still there after a reboot.'}
      ]
    },
    {
      id: 'acl-checkpoint', order: 6,
      courseSlug: 'comptia-network-course-6', courseTitle: 'CCNA Foundations',
      title: 'ACL Checkpoint',
      skill: 'Reading an access control list from top to bottom',
      mechanic: 'gate', prop: 'packet',
      scene: 'The branch router has an access list. In a wildcard like 0.0.0.255, a 0 must match and 255 means any number. Check each packet.',
      takeaway: 'An ACL is read top to bottom and the first matching rule wins. If no rule matches, a hidden deny at the end blocks the packet.',
      prompt: 'Check the source against the rules. Permit or deny?',
      actions: [
        {id: 'permit', label: 'Permit'},
        {id: 'deny', label: 'Deny'}
      ],
      items: [
        {title: 'Source 192.0.2.25', facts: ['Rule 1: permit 192.0.2.0 0.0.0.255', 'Rule 2: deny any'], answer: 'permit', why: 'Wildcard 0.0.0.255 matches any address that starts 192.0.2, so rule 1 matches first and permits it.'},
        {title: 'Source 198.51.100.7', facts: ['Rule 1: permit 192.0.2.0 0.0.0.255', 'Rule 2: deny any'], answer: 'deny', why: 'This address does not start with 192.0.2, so rule 1 does not match. It falls to rule 2, deny any.'},
        {title: 'Source 203.0.113.9', facts: ['Rule 1: permit 192.0.2.0 0.0.0.255', 'There are no other rules'], answer: 'deny', why: 'Every ACL ends with a hidden deny for anything that matched no rule. This packet matched nothing, so it is blocked.'},
        {title: 'Source 192.0.2.40', facts: ['Rule 1: deny host 192.0.2.40', 'Rule 2: permit any'], answer: 'deny', why: 'Rule 1 names this exact host and denies it. The router stops at the first match, so rule 2 is never checked.'},
        {title: 'Source 192.0.2.41', facts: ['Rule 1: deny host 192.0.2.40', 'Rule 2: permit any'], answer: 'permit', why: 'Rule 1 only blocks the single host .40. This packet is from .41, so it moves on and matches permit any.'},
        {title: 'Source 192.0.2.60', facts: ['Rule 1: permit any', 'Rule 2: deny host 192.0.2.60'], answer: 'permit', why: 'Order matters. permit any matches first, so the deny line below it is never reached. Put specific rules on top.'},
        {title: 'Source 198.51.100.20', facts: ['Rule 1: deny 198.51.100.0 0.0.0.255', 'Rule 2: permit any'], answer: 'deny', why: 'The wildcard 0.0.0.255 covers every address that starts 198.51.100, so rule 1 matches and denies it.'},
        {title: 'Source 192.0.2.100', facts: ['Rule 1: permit 192.0.2.0 0.0.0.127', 'Wildcard 0.0.0.127 means last number 0 to 127', 'Rule 2: deny any'], answer: 'permit', why: 'Wildcard 0.0.0.127 covers 192.0.2.0 through 192.0.2.127. Address .100 is in that range, so rule 1 permits it.'}
      ]
    },
    {
      id: 'protocol-connect', order: 7,
      courseSlug: 'comptia-network-course-7', courseTitle: 'TCP/IP and Advanced Topics',
      title: 'Protocol Connect',
      skill: 'Connecting TCP/IP protocols, ports and IPv6 terms to their jobs',
      mechanic: 'match', prop: 'packet',
      scene: 'A developer at Larkspur Freight shares a packet capture. You need to know every protocol you see in it.',
      takeaway: 'Read a capture in layers: the port names the service, TCP or UDP says how it travels, and an IPv6 address is 128 bits.',
      rounds: [
        {prompt: 'Match each protocol to its well-known port.', pairs: [['SSH', 'Port 22'], ['SMTP', 'Port 25'], ['DNS', 'Port 53'], ['HTTP', 'Port 80'], ['HTTPS', 'Port 443']], why: 'Servers listen on standard ports so clients know where to connect: SSH on 22, SMTP mail on 25, DNS on 53, web on 80 and 443.'},
        {prompt: 'Match each protocol to what it does.', pairs: [['TCP', 'Reliable, ordered, confirmed delivery'], ['UDP', 'Fast sending with no setup or replies'], ['ICMP', 'Error and test messages, used by ping'], ['ARP', 'Finds the MAC for an IPv4 address']], why: 'TCP trades speed for reliability, UDP trades reliability for speed, ICMP reports problems, and ARP links IPv4 to MAC addresses.'},
        {prompt: 'Match each IPv6 term to its meaning.', pairs: [['::1', 'Loopback, this computer itself'], ['fe80::/10', 'Link-local, stays on the local link'], ['NDP', 'Finds IPv6 neighbors and routers'], ['128 bits', 'Size of an IPv6 address']], why: 'IPv6 addresses are 128 bits long. ::1 points back to the same host, fe80 addresses never leave the link, and NDP takes the place of ARP.'}
      ]
    },
    {
      id: 'trace-the-fault', order: 8,
      courseSlug: 'comptia-network-course-8', courseTitle: 'Operating Systems and Networking Fundamentals',
      title: 'Trace the Fault',
      skill: 'Putting network troubleshooting checks in the right order',
      mechanic: 'order', prop: 'clipboard',
      scene: 'An Ubuntu workstation is offline while the Windows PCs on the same switch work fine. You start testing.',
      takeaway: 'Test from the bottom up: link, address, gateway, outside address, then names. The first test that fails shows you where to look.',
      rounds: [
        {prompt: 'The Ubuntu PC cannot reach the internet. Work from the bottom up, closest to the PC first.', steps: ['Check the link light and cable', 'Check for an IP address (ip addr)', 'Ping the default gateway', 'Ping an outside IP address', 'Test a name lookup (nslookup)'], why: 'Work outward one hop at a time: link, address, gateway, then the outside world. Names come last: if an IP pings but a name fails, the fault is DNS.'},
        {prompt: 'A Windows PC on the same switch now has a bad address. Get a fresh one and test it.', steps: ['Run ipconfig /release', 'Run ipconfig /renew', 'Check the new address with ipconfig', 'Ping the gateway it shows'], why: 'Release drops the old lease, renew asks DHCP for a new one, and ipconfig shows the address and gateway you then test with ping.'}
      ]
    },
    {
      id: 'subnet-sprint', order: 9,
      courseSlug: 'comptia-network-course-9', courseTitle: 'Network Foundations and Addressing',
      title: 'Subnet Sprint',
      skill: 'Sizing subnets and finding which subnet holds an address',
      mechanic: 'lane', prop: 'packet',
      scene: 'Larkspur Freight is opening new branches. You plan the subnets for each site before the routers ship.',
      takeaway: 'Host bits set the size: 2 to the power of the host bits, minus 2 for the network and broadcast addresses. Pick the smallest subnet that fits.',
      questions: [
        {prompt: 'A branch needs 50 usable addresses. Which prefix gives the smallest subnet that fits?', options: ['/25', '/26', '/27'], answer: 1, why: 'A /26 has 6 host bits: 64 addresses, 62 usable. A /27 gives only 30 usable, and a /25 wastes space.'},
        {prompt: 'How many usable host addresses are in a /24?', options: ['254', '255', '256'], answer: 0, why: 'A /24 has 256 addresses. The first is the network address and the last is broadcast, which leaves 254.'},
        {prompt: 'How many usable host addresses are in a /27?', options: ['32', '30', '62'], answer: 1, why: 'A /27 leaves 5 host bits: 32 addresses. Take away network and broadcast and 30 are usable.'},
        {prompt: 'Which subnet mask is the same as /26?', options: ['255.255.255.128', '255.255.255.224', '255.255.255.192'], answer: 2, why: '/26 means 26 network bits. The last octet has two bits on, 128 plus 64, which is 192.'},
        {prompt: 'Which subnet holds host 192.0.2.130?', options: ['192.0.2.0/25', '192.0.2.128/25', '192.0.2.192/26'], answer: 1, why: '192.0.2.128/25 runs from .128 to .255, so .130 is inside it. The /26 starting at .192 begins too late.'},
        {prompt: 'Which range is private, for use inside an office?', options: ['203.0.113.0/24', '198.51.100.0/24', '172.16.0.0/12'], answer: 2, why: 'The private ranges are 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16. The other two are set aside for examples.'},
        {prompt: 'What is the broadcast address of 192.0.2.0/26?', options: ['192.0.2.63', '192.0.2.64', '192.0.2.255'], answer: 0, why: 'A /26 holds 64 addresses, .0 to .63. The last one, .63, is the broadcast. The next subnet starts at .64.'},
        {prompt: 'How many /26 subnets fit inside one /24?', options: ['2', '8', '4'], answer: 2, why: 'Each /26 uses 64 addresses, and a /24 has 256. That makes room for exactly 4 of them.'}
      ]
    }
  ]
};
