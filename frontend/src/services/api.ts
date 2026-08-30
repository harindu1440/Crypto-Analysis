export const checkHealth = async () => {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch health status:', error);
    throw error;
  }
};
