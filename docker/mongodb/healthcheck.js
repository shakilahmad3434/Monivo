// Initialize once, then report healthy only after this member becomes primary.
try {
  rs.status();
} catch (error) {
  if (error.code !== 94) {
    throw error;
  }

  const result = rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: 'localhost:27017' }],
  });

  if (result.ok !== 1) {
    throw new Error(JSON.stringify(result));
  }
}

quit(db.hello().isWritablePrimary ? 0 : 1);
