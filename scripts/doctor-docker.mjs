import {execFileSync} from 'node:child_process';
execFileSync('/opt/homebrew/bin/docker-compose',['--env-file','.deploy.env','exec','-T','app','node','scripts/doctor.mjs'],{env:{...process.env,DOCKER_CONTEXT:'colima-sanzo'},stdio:'inherit'});
