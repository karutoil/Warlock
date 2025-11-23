const {host} = getPathParams('/host/firewall/:host'),
	tableBody = document.getElementById('firewallTableBody'),
	addBtn = document.getElementById('btnAddRule'),
	addModal = document.getElementById('addRuleModal'),
	deleteModal = document.getElementById('deleteRuleModal'),
	btnPauseFirewall = document.getElementById('btnPauseFirewall'),
	btnEnableFirewall = document.getElementById('btnEnableFirewall');

function sanitizeForPreview(text){
	return (text || '').replace(/[<>\n\r]/g, '');
}

function renderRules(rules){
	tableBody.innerHTML = '';
	if (!rules || rules.length === 0){
		tableBody.innerHTML = '<tr><td colspan="6">No rules configured</td></tr>';
		return;
	}

	rules.forEach(rule => {
		const tr = document.createElement('tr'),
			tdTo = document.createElement('td'),
			tdFrom = document.createElement('td'),
			tdProto = document.createElement('td'),
			tdAction = document.createElement('td'),
			tdComment = document.createElement('td'),
			tdActions = document.createElement('td'),
			delBtn = document.createElement('button');

		tdTo.textContent = rule.to;
		tdFrom.textContent = rule.from || 'any';
		tdProto.textContent = (rule.proto || 'any').toUpperCase();
		tdAction.textContent = (rule.action || '').toUpperCase();
		tdAction.className = 'status-' + (rule.action || 'unknown').toLowerCase();
		tdComment.textContent = rule.comment || '';
		delBtn.className = 'action-remove';
		delBtn.textContent = 'Delete';
		delBtn.addEventListener('click', () => {
			// populate delete modal
			const spec = {
				action: rule.action,
				proto: rule.proto || undefined,
				from: rule.from || undefined,
				to: rule.to || undefined
			};
			// Show a sanitized preview
			document.getElementById('deleteRulePreview').textContent =
				`To: ${sanitizeForPreview(spec.port || spec.to || 'any')}\nFrom: ${sanitizeForPreview(spec.from || 'any')}\nAction: ${sanitizeForPreview(spec.action)}`;
			document.getElementById('delRuleSpec').value = JSON.stringify(spec);
			deleteModal.classList.add('show');
		});
		tdActions.appendChild(delBtn);

		tr.appendChild(tdTo);
		tr.appendChild(tdFrom);
		tr.appendChild(tdProto);
		tr.appendChild(tdAction);
		tr.appendChild(tdComment);
		tr.appendChild(tdActions);
		tableBody.appendChild(tr);
	});
}

async function fetchRules(){
	tableBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
	fetch(`/api/firewall/${host}`, { method: 'GET' })
		.then(response => response.json())
		.then(resp => {
			const statusActive = document.getElementById('firewallStatusActive'),
				statusInactive = document.getElementById('firewallStatusInactive'),
				statusNotInstalled = document.getElementById('firewallStatusNotInstalled');

			if (!resp || !resp.success){
				showToast('error', resp && resp.error ? resp.error : 'Failed to fetch rules');
				tableBody.innerHTML = '<tr><td colspan="6">Error loading rules</td></tr>';
				return;
			}

			// Update status indicators
			if (resp.status === 'active') {
				statusActive.style.display = 'flex';
				statusInactive.style.display = 'none';
				statusNotInstalled.style.display = 'none';
				btnEnableFirewall.style.display = 'none';
				btnPauseFirewall.style.display = 'inline-block';
			}
			else if (resp.status === 'inactive') {
				statusActive.style.display = 'none';
				statusInactive.style.display = 'flex';
				statusNotInstalled.style.display = 'none';
				btnEnableFirewall.style.display = 'inline-block';
				btnPauseFirewall.style.display = 'none';
			}
			else {
				statusActive.style.display = 'none';
				statusInactive.style.display = 'none';
				statusNotInstalled.style.display = 'flex';
				btnEnableFirewall.style.display = 'none';
				btnPauseFirewall.style.display = 'none';
			}

			renderRules(resp.rules || []);
		}).catch(e => {
			console.error(e);
			showToast('error', 'Error fetching rules');
			tableBody.innerHTML = '<tr><td colspan="6">Error loading rules</td></tr>';
		});
}

(function(){
	loadHost(host);

    // Add rule wiring
    addBtn.addEventListener('click', () => {
		addModal.classList.add('show');
	});
    document.getElementById('saveRuleBtn').addEventListener('click', () => {
        const action = document.getElementById('ruleAction').value;
        const proto = document.getElementById('ruleProto').value || undefined;
        const from = document.getElementById('ruleFrom').value.trim() || undefined;
        const to = document.getElementById('ruleTo').value.trim() || undefined;
        const comment = document.getElementById('ruleComment').value.trim() || undefined;

        // simple client validation
        const allowedActions = ['ALLOW','DENY','REJECT'];
        if (!allowedActions.includes(action)) return showToast('error','Invalid action');
        if (proto && !['tcp','udp'].includes(proto)) return showToast('error','Invalid proto');
        if (comment && !/^[a-zA-Z0-9 _.\-()]+$/.test(comment)) return showToast('error','Invalid comment characters');

        const payload = { action };
        if (proto) payload.proto = proto;
        if (from) payload.from = from;
        if (to) payload.to = to;
        if (comment) payload.comment = comment;

        fetch(`/api/firewall/${host}`, {
			method: 'POST',
			headers: {'Content-Type':'application/json'},
			body: JSON.stringify(payload)
		})
			.then(response => response.json())
			.then(resp => {
				showToast('info', resp.stdout);
				addModal.classList.remove('show');
				fetchRules();
			}).catch(() => {
				showToast('error', 'Failed to add rule');
			});
    });

    // Delete confirm
    document.getElementById('confirmDeleteRuleBtn').addEventListener('click', () => {
        const specRaw = document.getElementById('delRuleSpec').value;
        if (!specRaw) return showToast('error','No rule specified');
        let spec = null;
        try { spec = JSON.parse(specRaw); } catch(e){ return showToast('error','Invalid rule spec'); }

        fetch(`/api/firewall/${host}`, {
			method: 'DELETE',
			headers: {'Content-Type':'application/json'},
			body: JSON.stringify(spec)
		})
			.then(resp => resp.json())
			.then(resp => {
				showToast('info', resp.stdout);
				fetchRules();
				deleteModal.classList.remove('show');
			}).catch(() => {
				showToast('error','Failed to delete rule');
			});
    });

	btnPauseFirewall.addEventListener('click', () => {
		fetch(`/api/firewall/disable/${host}`, { method: 'POST' }).then(() => {
			fetchRules();
		});
	});

	btnEnableFirewall.addEventListener('click', () => {
		fetch(`/api/firewall/enable/${host}`, { method: 'POST' }).then(() => {
			fetchRules();
		});
	});

    // initial load
    fetchRules();
})();
