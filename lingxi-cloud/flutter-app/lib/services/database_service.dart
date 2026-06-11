import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart' as p;

class DatabaseService {
  static Database? _db;
  static const int _version = 1;


  /// 创建所有表（onCreate 和 onUpgrade 共用）
  static Future<void> _createAllTables(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        serverId TEXT NOT NULL,
        sessionKey TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        agentId TEXT,
        imageUrl TEXT,
        audioUrl TEXT,
        documentInfo TEXT,
        modelInfo TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    ''');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages (serverId, sessionKey, createdAt)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_messages_updated ON messages (serverId, sessionKey, updatedAt DESC)');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS sessions (
        serverId TEXT NOT NULL,
        sessionKey TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        agentId TEXT,
        lastMessage TEXT,
        lastMessageAt INTEGER,
        updatedAt INTEGER NOT NULL,
        PRIMARY KEY (serverId, sessionKey)
      )
    ''');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions (serverId, updatedAt DESC)');
  }

  static Future<Database> get database async {
    if (_db != null && _db!.isOpen) return _db!;
    _db = await _initDb();
    return _db!;
  }

  static Future<Database> _initDb() async {
    final dbPath = await getDatabasesPath();
    final path = p.join(dbPath, 'lingxi.db');
    return openDatabase(
      path,
      version: _version,
      onCreate: (db, version) async {
        await _createAllTables(db);
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        debugPrint('📦 DB upgrade: v\$oldVersion → v\$newVersion');
        // 未来迁移：
        // if (oldVersion < 2) { await db.execute('ALTER TABLE messages ADD COLUMN tokens INTEGER'); }
        await _createAllTables(db);
      },
    );
  }

  // ═══════════════════════════════════════
  // Messages
  // ═══════════════════════════════════════

  /// 保存/更新消息（upsert）
  static Future<void> upsertMessage({
    required String serverId,
    required String sessionKey,
    required Map<String, dynamic> msg,
  }) async {
    final db = await database;
    final id = msg['id']?.toString() ?? DateTime.now().microsecondsSinceEpoch.toString();
    final now = DateTime.now().millisecondsSinceEpoch;
    final createdAt = _parseTimestamp(msg['createdAt']) ?? now;

    await db.insert('messages', {
      'id': id,
      'serverId': serverId,
      'sessionKey': sessionKey,
      'role': msg['role']?.toString() ?? 'user',
      'content': msg['content']?.toString() ?? '',
      'agentId': msg['agentId']?.toString(),
      'imageUrl': msg['imageUrl']?.toString(),
      'audioUrl': msg['audioUrl']?.toString(),
      'documentInfo': msg['documentInfo'] != null ? jsonEncode(msg['documentInfo']) : null,
      'modelInfo': msg['modelInfo'] != null ? jsonEncode(msg['modelInfo']) : null,
      'createdAt': createdAt,
      'updatedAt': now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  /// 批量保存消息
  static Future<void> upsertMessages({
    required String serverId,
    required String sessionKey,
    required List<Map<String, dynamic>> messages,
  }) async {
    final db = await database;
    final batch = db.batch();
    final now = DateTime.now().millisecondsSinceEpoch;

    for (int i = 0; i < messages.length; i++) {
      final msg = messages[i];
      final id = msg['id']?.toString() ?? '\${DateTime.now().microsecondsSinceEpoch}-\$i';
      final createdAt = _parseTimestamp(msg['createdAt']) ?? now;

      batch.insert('messages', {
        'id': id,
        'serverId': serverId,
        'sessionKey': sessionKey,
        'role': msg['role']?.toString() ?? 'user',
        'content': msg['content']?.toString() ?? '',
        'agentId': msg['agentId']?.toString(),
        'imageUrl': msg['imageUrl']?.toString(),
        'audioUrl': msg['audioUrl']?.toString(),
        'documentInfo': msg['documentInfo'] != null ? jsonEncode(msg['documentInfo']) : null,
        'modelInfo': msg['modelInfo'] != null ? jsonEncode(msg['modelInfo']) : null,
        'createdAt': createdAt,
        'updatedAt': now,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await batch.commit(noResult: true);
  }

  /// 加载会话消息（按时间正序）
  static Future<List<Map<String, dynamic>>> loadMessages({
    required String serverId,
    required String sessionKey,
    int limit = 100,
    int offset = 0,
  }) async {
    final db = await database;
    final rows = await db.query(
      'messages',
      where: 'serverId = ? AND sessionKey = ?',
      whereArgs: [serverId, sessionKey],
      orderBy: 'createdAt ASC',
      limit: limit,
      offset: offset,
    );
    return rows.map(_rowToMessage).toList();
  }

  /// 获取最新消息的时间戳（用于增量同步）
  static Future<int?> getLatestMessageTimestamp({
    required String serverId,
    required String sessionKey,
  }) async {
    final db = await database;
    final rows = await db.query(
      'messages',
      where: 'serverId = ? AND sessionKey = ?',
      whereArgs: [serverId, sessionKey],
      orderBy: 'createdAt DESC',
      limit: 1,
      columns: ['createdAt'],
    );
    if (rows.isEmpty) return null;
    return rows.first['createdAt'] as int?;
  }

  /// 获取消息数量
  static Future<int> getMessageCount({
    required String serverId,
    required String sessionKey,
  }) async {
    final db = await database;
    final result = await db.rawQuery(
      'SELECT COUNT(*) as count FROM messages WHERE serverId = ? AND sessionKey = ?',
      [serverId, sessionKey],
    );
    return result.first['count'] as int? ?? 0;
  }

  /// 删除会话的所有消息
  static Future<void> deleteMessages({
    required String serverId,
    required String sessionKey,
  }) async {
    final db = await database;
    await db.delete(
      'messages',
      where: 'serverId = ? AND sessionKey = ?',
      whereArgs: [serverId, sessionKey],
    );
  }

  /// 清理旧消息（每个会话只保留最近 N 条）
  static Future<void> pruneOldMessages({int keepPerSession = 500}) async {
    final db = await database;
    final sessions = await db.rawQuery(
      'SELECT DISTINCT serverId, sessionKey FROM messages',
    );
    await db.transaction((txn) async {
      for (final s in sessions) {
        final serverId = s['serverId'] as String;
        final sessionKey = s['sessionKey'] as String;
        await txn.execute('''
          DELETE FROM messages 
          WHERE serverId = ? AND sessionKey = ? 
          AND createdAt NOT IN (
            SELECT createdAt FROM messages 
            WHERE serverId = ? AND sessionKey = ? 
            ORDER BY createdAt DESC 
            LIMIT ?
          )
        ''', [serverId, sessionKey, serverId, sessionKey, keepPerSession]);
      }
    });
  }

  /// 删除某设备的所有数据
  static Future<void> deleteServerData({required String serverId}) async {
    final db = await database;
    await db.delete('messages', where: 'serverId = ?', whereArgs: [serverId]);
    await db.delete('sessions', where: 'serverId = ?', whereArgs: [serverId]);
  }

  // ═══════════════════════════════════════
  // Sessions
  // ═══════════════════════════════════════

  /// 保存/更新会话
  static Future<void> upsertSession({
    required String serverId,
    required Map<String, dynamic> session,
  }) async {
    final db = await database;
    final sessionKey = session['key']?.toString() ?? session['sessionKey']?.toString();
    if (sessionKey == null || sessionKey.isEmpty) return;

    final now = DateTime.now().millisecondsSinceEpoch;
    final timestamp = _parseTimestamp(session['updatedAt']) ?? now;

    await db.insert('sessions', {
      'serverId': serverId,
      'sessionKey': sessionKey,
      'title': session['title']?.toString() ?? '',
      'agentId': session['agentId']?.toString(),
      'lastMessage': session['lastMessage']?.toString(),
      'lastMessageAt': _parseTimestamp(session['updatedAt']),
      'updatedAt': timestamp,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  /// 批量保存会话
  static Future<void> upsertSessions({
    required String serverId,
    required List<Map<String, dynamic>> sessions,
  }) async {
    final db = await database;
    final batch = db.batch();
    final now = DateTime.now().millisecondsSinceEpoch;

    for (final session in sessions) {
      final sessionKey = session['key']?.toString() ?? session['sessionKey']?.toString();
      if (sessionKey == null || sessionKey.isEmpty) continue;

      final timestamp = _parseTimestamp(session['updatedAt']) ?? now;

      batch.insert('sessions', {
        'serverId': serverId,
        'sessionKey': sessionKey,
        'title': session['title']?.toString() ?? '',
        'agentId': session['agentId']?.toString(),
        'lastMessage': session['lastMessage']?.toString(),
        'lastMessageAt': _parseTimestamp(session['updatedAt']),
        'updatedAt': timestamp,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await batch.commit(noResult: true);
  }

  /// 加载会话列表（按时间倒序）
  static Future<List<Map<String, dynamic>>> loadSessions({
    required String serverId,
    int limit = 50,
  }) async {
    final db = await database;
    final rows = await db.query(
      'sessions',
      where: 'serverId = ?',
      whereArgs: [serverId],
      orderBy: 'updatedAt DESC',
      limit: limit,
    );
    return rows.map((row) => {
      'key': row['sessionKey'],
      'title': row['title'],
      'agentId': row['agentId'],
      'lastMessage': row['lastMessage'],
      'updatedAt': row['updatedAt'],
      'timestamp': row['updatedAt'],
    }).toList();
  }

  /// 删除会话
  static Future<void> deleteSession({
    required String serverId,
    required String sessionKey,
  }) async {
    final db = await database;
    await db.delete('sessions', where: 'serverId = ? AND sessionKey = ?', whereArgs: [serverId, sessionKey]);
    await db.delete('messages', where: 'serverId = ? AND sessionKey = ?', whereArgs: [serverId, sessionKey]);
  }

  // ═══════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════

  static int? _parseTimestamp(dynamic value) {
    if (value == null) return null;
    if (value is int) return value;
    if (value is String) {
      final dt = DateTime.tryParse(value);
      return dt?.millisecondsSinceEpoch;
    }
    return null;
  }

  static Map<String, dynamic> _rowToMessage(Map<String, dynamic> row) {
    final result = <String, dynamic>{
      'id': row['id'],
      'role': row['role'],
      'content': row['content'],
      'createdAt': row['createdAt'],
      'agentId': row['agentId'],
      'imageUrl': row['imageUrl'],
      'audioUrl': row['audioUrl'],
      'modelInfo': row['modelInfo'] != null ? jsonDecode(row['modelInfo']) : null,
    };
    if (row['documentInfo'] != null) {
      result['documentInfo'] = jsonDecode(row['documentInfo']);
    }
    return result;
  }
}
