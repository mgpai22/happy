import { OpenCodeSessionView } from '@/-opencode/OpenCodeSessionView';
import { useRoute } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import * as React from 'react';

export default React.memo(() => {
	const route = useRoute();
	const params = useLocalSearchParams<{
		id: string;
		sandboxIp: string;
		openCodeSessionId: string;
	}>();

	const fusionSessionId = (route.params as { id: string })?.id || params.id;
	const sandboxIp = params.sandboxIp;
	const openCodeSessionId = params.openCodeSessionId;

	if (!fusionSessionId || !sandboxIp || !openCodeSessionId) {
		return null;
	}

	return (
		<OpenCodeSessionView
			fusionSessionId={fusionSessionId}
			sandboxIp={sandboxIp}
			openCodeSessionId={openCodeSessionId}
		/>
	);
});
