export default {
  id: 'comptia-a-professional-certificate',
  title: 'Bench Tech',
  tagline: 'Short practice breaks for new PC repair and support techs.',
  role: 'You are a bench tech at Copperline PC Repair, fixing whatever comes in the door.',
  program: 'CompTIA A+ Professional Certificate (CompTIA A+)',
  theme: {world: 'office', accent: '#b8452f', mood: 'dusk'},
  levels: [
    {
      id: 'name-the-part', order: 1,
      courseSlug: 'comptia-a-course-1',
      courseTitle: 'IT Fundamentals and Hardware Essentials',
      title: 'Name the Part',
      skill: 'Matching a job inside the PC to the part that does it',
      mechanic: 'sort', prop: 'chip',
      scene: 'An open desktop sits on your bench. Your lead points at parts and asks what each one does.',
      takeaway: 'The CPU thinks, RAM holds what you are working on, storage keeps files for later, and the power supply feeds them all.',
      prompt: 'Which part does this job?',
      bins: [
        {id: 'cpu', label: 'CPU'},
        {id: 'ram', label: 'RAM'},
        {id: 'storage', label: 'Storage'},
        {id: 'psu', label: 'Power supply'}
      ],
      items: [
        {label: 'Runs the instructions of programs', answer: 'cpu', why: 'The CPU, or processor, is the chip that carries out every program\'s instructions. It is the brain of the PC.'},
        {label: 'Sits under a cooler with paste', note: 'Paste helps move heat to the cooler', answer: 'cpu', why: 'The CPU makes a lot of heat, so it needs thermal paste and a cooler on top. Without them it shuts down to protect itself.'},
        {label: 'Holds the apps you have open', answer: 'ram', why: 'RAM is fast working memory. Open apps and files sit there so the CPU can reach them quickly.'},
        {label: 'Clicks into slots with side clips', answer: 'ram', why: 'RAM sticks go into memory slots and lock in with clips at each end. If the clips do not snap shut, the stick may not be seen.'},
        {label: 'Empties when the PC shuts down', answer: 'ram', why: 'RAM only holds data while it has power. That is why unsaved work is lost in a power cut.'},
        {label: 'Keeps your files with power off', answer: 'storage', why: 'Storage, such as an SSD or hard drive, keeps data even with no power. It is where files and apps live long term.'},
        {label: 'The SSD that Windows lives on', answer: 'storage', why: 'An SSD is a storage drive. The operating system is installed on storage so it is still there at the next start.'},
        {label: 'Turns wall power into DC power', answer: 'psu', why: 'The wall gives AC power, but PC parts need low-voltage DC. The power supply converts it and sends it to each part.'},
        {label: 'Sized by the watts it can supply', note: 'Such as 650 W', answer: 'psu', why: 'A power supply is sized by the watts it can deliver, such as 650 W. It must be big enough for every part in the case.'}
      ]
    },
    {
      id: 'wifi-and-ports', order: 2,
      courseSlug: 'comptia-a-course-2',
      courseTitle: 'Networking, Peripherals, and Wireless Technologies',
      title: 'Wi-Fi and Ports',
      skill: 'Picking the fix for common Wi-Fi and device problems',
      mechanic: 'lane', prop: 'packet',
      scene: 'A small office sends over a list of Wi-Fi, printer and screen complaints. You work down the list.',
      takeaway: 'Check the simple link first: is the address valid, is the cable in the right port, is the service running, is the channel crowded?',
      questions: [
        {prompt: 'A laptop gets the address 169.254.10.5 and cannot reach anything. What failed?', options: ['DHCP lease', 'DNS lookup', 'Web browser'], answer: 0, why: 'A 169.254 address is one the PC gives itself when no DHCP server answers. Without a real address it cannot talk to the network.'},
        {prompt: 'Eight access points (APs) all use channel 6 and Wi-Fi is slow. What helps most?', options: ['More APs on 6', 'Higher AP power', 'Use 1, 6 and 11'], answer: 2, why: 'Access points on the same channel take turns and slow each other down. On 2.4 GHz, channels 1, 6 and 11 do not overlap.'},
        {prompt: 'Which Wi-Fi band usually reaches farther through walls?', options: ['5 GHz', '2.4 GHz', '6 GHz'], answer: 1, why: 'Lower radio frequencies pass through walls better. The 2.4 GHz band reaches farther, while the higher bands are faster up close.'},
        {prompt: 'A printer says Ready, but Windows shows it offline. Which service do you restart?', options: ['DNS Client', 'Windows Update', 'Print Spooler'], answer: 2, why: 'The Print Spooler service holds and sends print jobs. When it gets stuck, printers can show offline until it is restarted.'},
        {prompt: 'Which one cable carries HD video and sound to a TV?', options: ['HDMI', 'VGA', 'RJ45'], answer: 0, why: 'HDMI carries digital video and audio together. VGA carries video only, and RJ45 is the plug on a network cable.'},
        {prompt: 'New graphics card, no picture. The monitor is in the motherboard port. Where should it go?', options: ['USB port', 'Graphics card port', 'Network port'], answer: 1, why: 'With a graphics card added, the picture usually comes out of the card. Many boards turn off their own video port when a card is present.'},
        {prompt: 'Which Windows tool shows whether a USB device was detected?', options: ['Device Manager', 'Disk Cleanup', 'Paint'], answer: 0, why: 'Device Manager lists every device Windows sees and flags ones with driver problems. It is the place to check a new device.'}
      ]
    },
    {
      id: 'virtual-and-secure', order: 3,
      courseSlug: 'comptia-a-course-3',
      courseTitle: 'Advanced Networking, Virtualization, and IT Security',
      title: 'Virtual and Secure',
      skill: 'Connecting virtual machine and network security terms to meanings',
      mechanic: 'match', prop: 'cloud-node',
      scene: 'A client wants test computers that run inside one PC, plus safe remote access. You explain the words.',
      takeaway: 'Pick the VM network mode by who must reach the VM: NAT hides it behind the host, bridged puts it on the network like a real PC.',
      rounds: [
        {prompt: 'Match each virtual machine (VM) word to its meaning.', pairs: [['Host', 'The physical PC that runs the VMs'], ['Guest', 'An operating system inside a VM'], ['Hypervisor', 'Software that creates and runs VMs'], ['Snapshot', 'A saved VM state you can return to']], why: 'A hypervisor lets one host run several guests. A snapshot lets you undo changes, which makes VMs safe for testing.'},
        {prompt: 'Match each VM network setting to what it does.', pairs: [['NAT mode', 'VM shares the host\'s IP address'], ['Bridged mode', 'VM gets its own address on the LAN'], ['Host-only mode', 'VM reaches only the host and other VMs'], ['Port forwarding', 'Lets outside traffic reach a NAT VM']], why: 'NAT lets a VM go out but hides it from other PCs. Bridged mode makes it a full member of the network. Host-only keeps it off the network.'},
        {prompt: 'Match each security word to its meaning.', pairs: [['Firewall', 'Allows or blocks traffic by rules'], ['VPN', 'Encrypted tunnel to a private network'], ['Full tunnel', 'Sends all traffic through the VPN'], ['Split tunnel', 'Sends only work traffic through VPN']], why: 'A VPN protects traffic over the internet. Full tunnel sends everything through it, so home printers may stop working. Split tunnel keeps local traffic local.'}
      ]
    },
    {
      id: 'find-the-bottleneck', order: 4,
      courseSlug: 'comptia-a-course-4',
      courseTitle: 'Foundations of Computer Hardware and Storage',
      title: 'Find the Bottleneck',
      skill: 'Choosing the upgrade that fixes a slow computer',
      mechanic: 'gate', prop: 'chip',
      scene: 'Customers want slow PCs faster but can pay for one upgrade. Find the bottleneck: the one part holding the rest back.',
      takeaway: 'Find the busy part. An idle CPU with a busy drive means storage, full memory means RAM, and a maxed CPU means the processor.',
      prompt: 'Which one upgrade fixes this slowdown?',
      actions: [
        {id: 'drive', label: 'Faster drive'},
        {id: 'ram', label: 'More RAM'},
        {id: 'cpu', label: 'Faster CPU'}
      ],
      items: [
        {title: 'Big video files open slowly', facts: ['Files are on an old spinning hard drive', 'CPU sits near 5% while loading', 'Drive shows 100% busy'], answer: 'drive', why: 'The CPU is idle because it is waiting for data from the slow drive. An SSD feeds data many times faster.'},
        {title: 'Crawls with just a few apps open', facts: ['Memory use stays at 97%', 'Only 4 GB of RAM installed', 'CPU use is low'], answer: 'ram', why: 'When RAM is full, Windows moves data to the drive, which is far slower. More RAM keeps apps in fast memory.'},
        {title: 'Video export takes hours', facts: ['CPU at 100% on every core', 'Plenty of free memory', 'Files are on a fast SSD'], answer: 'cpu', why: 'Memory and storage are fine, but the processor is maxed out. Of these upgrades, only a faster CPU will finish the work sooner.'},
        {title: 'Game levels take ages to load', facts: ['Plays smoothly once a level loads', 'Game is installed on a hard drive', 'Memory is only half used'], answer: 'drive', why: 'Slow loading but smooth play means the wait is reading files from disk. Moving the game to an SSD cuts load times.'},
        {title: 'Photo filters lag every time', facts: ['Old dual-core processor', 'CPU hits 100% during each filter', 'RAM and drive barely used'], answer: 'cpu', why: 'The filter work is all math for the processor, and the old CPU is the only part at its limit. A faster CPU is the upgrade that helps.'},
        {title: 'Low-memory warnings keep popping up', facts: ['Happens when many browser tabs are open', 'CPU and drive are mostly quiet'], answer: 'ram', why: 'The warning means the apps need more memory than the PC has. Adding RAM gives them room to run.'}
      ]
    },
    {
      id: 'command-line-steps', order: 5,
      courseSlug: 'comptia-a-course-5',
      courseTitle: 'Operating Systems and Networking Fundamentals',
      title: 'Command Line Steps',
      skill: 'Putting command line troubleshooting steps in order',
      mechanic: 'order', prop: 'code-block',
      scene: 'A customer calls: websites will not load on her PC, but a coworker\'s PC works. You walk her through command line tests.',
      takeaway: 'Test in layers from the PC outward: your own address, the gateway, then the internet. Fix the first layer that fails.',
      rounds: [
        {prompt: 'Websites fail, but a coworker on the same Wi-Fi is fine. Test from the PC out, near first.', steps: ['Run ipconfig to check the address', 'Ping the default gateway', 'Ping an outside IP address', 'Fix what failed and retest'], why: 'Testing near to far shows which layer broke. The default gateway is the router that leads outside. If your own address is bad, later tests mean nothing, so fix it first.'},
        {prompt: 'Another program is using port 8080. Find it and stop it.', steps: ['Open Command Prompt', 'Run netstat -ano', 'Note the PID on the :8080 line', 'Find that PID in Task Manager', 'End the task and retest'], why: 'netstat -ano lists ports with a process ID, or PID. Task Manager matches the PID to a program so you end the right one.'}
      ]
    },
    {
      id: 'lock-it-down', order: 6,
      courseSlug: 'comptia-a-course-6',
      courseTitle: 'Advanced Networking, Security, and IT Operations',
      title: 'Lock It Down',
      skill: 'Choosing the security control that fixes a risk',
      mechanic: 'sort', prop: 'clipboard',
      scene: 'A client office wants its new laptops to pass a basic security checklist. You check each risk on the list.',
      takeaway: 'Encrypt drives that could be lost, give users only the rights they need, keep patches current, and lock idle screens.',
      prompt: 'Which control fixes this risk?',
      bins: [
        {id: 'encrypt', label: 'Encryption'},
        {id: 'rights', label: 'Limit rights'},
        {id: 'patch', label: 'Updates'},
        {id: 'lock', label: 'Screen lock'}
      ],
      items: [
        {label: 'Sales laptops often left in cars', note: 'Drives hold client files', answer: 'encrypt', why: 'A thief can pull an unencrypted drive and read it on another PC. Full-disk encryption such as BitLocker makes the data unreadable.'},
        {label: 'USB stick carries payroll files', note: 'Taken between two offices', answer: 'encrypt', why: 'Small drives are easy to lose. Encrypting the stick means a finder cannot open the payroll files.'},
        {label: 'New hire asks for admin rights', note: 'Needs one approved app', answer: 'rights', why: 'Keep the hire a standard user and have IT install the app. Least privilege means giving only the access the job needs.'},
        {label: 'Daily account is a local admin', answer: 'rights', why: 'Malware runs with the rights of the user. A standard account for daily work stops it from changing the whole system.'},
        {label: 'Intern can open every team folder', answer: 'rights', why: 'The intern should reach only the folders their work needs. Trim the folder permissions to their team.'},
        {label: 'PC is missing months of fixes', answer: 'patch', why: 'Security updates close known holes that attackers use. Install the waiting updates and keep them on a schedule.'},
        {label: 'Known browser flaw has a fix out', answer: 'patch', why: 'Once a fix is out, attackers know about the flaw too. Updating the browser closes the hole.'},
        {label: 'Front desk PC left open at lunch', answer: 'lock', why: 'Anyone walking by could use the open session. Lock the screen when you step away.'},
        {label: 'PCs never lock when left idle', answer: 'lock', why: 'An automatic screen lock after a few idle minutes protects PCs when people forget to lock them.'}
      ]
    },
    {
      id: 'bench-triage', order: 7,
      courseSlug: 'comptia-a-course-7',
      courseTitle: 'Practice Exams for CompTIA A+ Core 1 & Core 2',
      title: 'Bench Triage',
      skill: 'Telling hardware, software and network problems apart',
      mechanic: 'gate', prop: 'ticket',
      scene: 'It is a busy Saturday at Copperline. Mixed repair tickets stack up, and you sort where to look first.',
      takeaway: 'Let the clues lead. Power, heat and parts mean hardware; trouble after an update means software; bad addresses, names or unreachable hosts mean network.',
      prompt: 'Where should you look first?',
      actions: [
        {id: 'hardware', label: 'Hardware'},
        {id: 'software', label: 'Software'},
        {id: 'network', label: 'Network'}
      ],
      items: [
        {title: 'Desktop is dead, no fans or lights', facts: ['Wall outlet powers a lamp fine', 'Power cable is seated, PSU switch on'], answer: 'hardware', why: 'Good wall power and cable rule out the outside causes. Next, test the power supply with a known good one.'},
        {title: 'Accounting app closes on launch', facts: ['Started after the app updated', 'Other apps run normally'], answer: 'software', why: 'One app failing right after its own update points to that app. Repair or reinstall it before touching hardware.'},
        {title: 'Laptop works at home, not at office', facts: ['Office Wi-Fi shows Connected', 'ipconfig shows no default gateway'], answer: 'network', why: 'With no gateway, the laptop has no route out of its own network. Check the DHCP settings on the office router.'},
        {title: 'Powers on, then off in 3 seconds', facts: ['CPU cooler was just removed and refit', 'No picture, repeats every time'], answer: 'hardware', why: 'Quick shutdowns right after cooler work point to a cooler that is not seated. The CPU overheats and the PC cuts power.'},
        {title: 'Can ping 203.0.113.5, no websites', facts: ['Site names will not load', 'nslookup times out'], answer: 'network', why: 'Traffic to an IP works, but names fail, so DNS is the problem. Check the DNS server setting.'},
        {title: 'Blue screens after a driver install', facts: ['Began right after a new printer driver', 'Hardware tests all pass'], answer: 'software', why: 'A driver is software. Trouble that starts right after installing one is fixed by rolling back or replacing the driver.'},
        {title: 'New RAM, but the total did not change', facts: ['Stick was added an hour ago', 'BIOS counts only the old memory'], answer: 'hardware', why: 'If the BIOS does not see the new stick, it is likely not fully seated. Press it in until both clips lock.'},
        {title: 'Office PCs cannot reach a test VM', facts: ['Other PCs on the LAN get no reply from the VM', 'VM can browse the web fine', 'VM uses a private address behind the host'], answer: 'network', why: 'The VM can go out, but nothing can reach it in. NAT hides it behind the host. Switch to bridged mode or forward a port.'}
      ]
    }
  ]
};
