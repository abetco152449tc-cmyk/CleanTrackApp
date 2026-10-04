import { Text, View } from 'react-native';
import { useStore } from '@/lib/store';
import { Button, s } from './clean-ui';

export default function ReportPagination() {
  const { reports, hasMoreReports, loadingMoreReports, loadMoreReports, paginationError } =
    useStore();
  if (!loadMoreReports) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.muted}>
        {reports.length} reports loaded. Search and filters cover loaded reports.
      </Text>
      {!!paginationError && (
        <Text accessibilityRole="alert" style={s.error}>
          {paginationError}
        </Text>
      )}
      {hasMoreReports && (
        <Button
          title={loadingMoreReports ? 'Loading older reports...' : 'Load older reports'}
          secondary
          disabled={loadingMoreReports}
          onPress={() => void loadMoreReports()}
        />
      )}
      {!hasMoreReports && reports.length > 0 && (
        <Text style={s.muted}>You have reached the end of your report history.</Text>
      )}
    </View>
  );
}
