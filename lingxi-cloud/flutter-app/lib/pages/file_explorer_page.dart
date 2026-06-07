import 'package:flutter/material.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:lingxicloud/pages/file_viewer_page.dart';
import 'package:flutter/services.dart';

class FileExplorerPage extends StatefulWidget {
  final String initialPath;
  const FileExplorerPage({super.key, this.initialPath = '/root'});

  @override
  State<FileExplorerPage> createState() => _FileExplorerPageState();
}

class _FileExplorerPageState extends State<FileExplorerPage> {
  bool _isLoading = true;
  String? _error;
  String _currentPath = '/root';
  List<Map<String, dynamic>> _files = [];
  bool _fileApiMissing = false;

  // Install script for file-api
  static const _installScript = r'''mkdir -p /opt/lingxi && cat > /opt/lingxi/file-api.js << 'SCRIPT'
#!/usr/bin/env node
const http=require('http'),fs=require('fs'),path=require('path'),{execSync}=require('child_process');
const PORT=9092;
function safePath(p){return path.resolve(p)}
function parseLs(out,bp){const f=[];for(const l of out.split('\n')){const m=l.match(/^([dlcbps-])([rwxsStT-]{9})\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\w{3}\s+\d{1,2}\s+[\d:]+)\s+(.+)/);if(!m)continue;const[,t,pm,,ow,,sz,dt,nm]=m;if(nm==='.'||nm==='..')continue;f.push({name:nm,path:bp==='/'?'/'+nm:bp+'/'+nm,isDir:t==='d',size:parseInt(sz),perms:pm,owner:ow,date:dt.trim()})}f.sort((a,b)=>{if(a.isDir!==b.isDir)return a.isDir?-1:1;return a.name.localeCompare(b.name)});return f}
const s=http.createServer((q,r)=>{r.setHeader('Access-Control-Allow-Origin','*');r.setHeader('Content-Type','application/json');const u=new URL(q.url,'http://localhost:'+PORT);const fp=safePath(u.searchParams.get('path')||'/root');if(u.pathname==='/api/list'){try{const o=execSync('ls -la "'+fp+'"',{timeout:5000,encoding:'utf8'});r.end(JSON.stringify({path:fp,files:parseLs(o,fp)}))}catch(e){r.statusCode=500;r.end(JSON.stringify({error:e.stderr||e.message}))}}else if(u.pathname==='/api/get'){try{const st=fs.statSync(fp);if(st.isDirectory()){r.statusCode=400;return r.end(JSON.stringify({error:'是目录'}))}if(st.size>5*1024*1024){r.statusCode=400;return r.end(JSON.stringify({error:'文件太大(>5MB)'}))}r.end(JSON.stringify({path:fp,content:fs.readFileSync(fp,'utf8'),size:st.size}))}catch(e){r.statusCode=500;r.end(JSON.stringify({error:e.message}))}}else if(u.pathname==='/api/health'){r.end(JSON.stringify({ok:true}))}else{r.statusCode=404;r.end(JSON.stringify({error:'未知接口'}))}});
s.listen(PORT,'0.0.0.0',()=>console.log('file-api on :'+PORT));
SCRIPT
cat > /etc/systemd/system/lingxi-file-api.service << 'EOF'
[Unit]
Description=LingXi File API
After=network.target
[Service]
ExecStart=/usr/bin/node /opt/lingxi/file-api.js
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload && systemctl enable lingxi-file-api && systemctl start lingxi-file-api && echo "OK file-api started on :9092"''';

  @override
  void initState() {
    super.initState();
    _currentPath = widget.initialPath;
    _loadFiles();
  }

  Future<void> _loadFiles() async {
    setState(() { _isLoading = true; _error = null; _fileApiMissing = false; });
    try {
      final api = ApiService();
      final data = await api.listFiles(_currentPath);
      final files = List<Map<String, dynamic>>.from(data['files'] ?? []);
      files.sort((a, b) {
        final aDir = a['isDir'] == true, bDir = b['isDir'] == true;
        if (aDir && !bDir) return -1;
        if (!aDir && bDir) return 1;
        return (a['name'] ?? '').compareTo(b['name'] ?? '');
      });
      if (data['path'] != null) _currentPath = data['path'].toString();
      if (mounted) setState(() { _files = files; _isLoading = false; });
    } catch (e) {
      final msg = e.toString().toLowerCase();
      // Broad detection: any connection/file-api related error shows install guide
      final missing = msg.contains('connect') ||
          msg.contains('refused') ||
          msg.contains('timeout') ||
          msg.contains('econnrefused') ||
          msg.contains('没有可用的服务器') ||
          msg.contains('无可用') ||
          msg.contains('enoent') ||
          msg.contains('network') ||
          msg.contains('socket') ||
          msg.contains('500') ||
          msg.contains('bad response') ||
          msg.contains('failed') ||
          msg.contains('error') ||
          msg.contains('file-api') ||
          msg.contains('加载失败');
      if (mounted) setState(() { _error = e.toString(); _isLoading = false; _fileApiMissing = missing; });
    }
  }

  void _navigateTo(String path) { setState(() => _currentPath = path); _loadFiles(); }
  void _goUp() {
    if (_currentPath == '/' || _currentPath.isEmpty) return;
    final parts = _currentPath.split('/')..removeLast();
    _navigateTo(parts.isEmpty ? '/' : parts.join('/'));
  }

  List<String> _breadcrumbs() {
    if (_currentPath == '/') return ['/'];
    return ['/', ..._currentPath.split('/').where((p) => p.isNotEmpty)];
  }

  String _crumbPath(int idx) => idx == 0 ? '/' : '/${_breadcrumbs().sublist(1, idx + 1).join('/')}';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('📁 文件管理'), actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: _isLoading ? null : _loadFiles, tooltip: '刷新'),
      ]),
      body: Column(children: [
        _buildBreadcrumbs(),
        const Divider(height: 1),
        Expanded(child: _isLoading ? const Center(child: CircularProgressIndicator()) : _error != null ? _buildError() : _buildList()),
      ]),
    );
  }

  Widget _buildBreadcrumbs() {
    final crumbs = _breadcrumbs();
    return Container(width: double.infinity, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8), color: Colors.grey.shade100,
      child: SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: List.generate(crumbs.length, (i) {
        final last = i == crumbs.length - 1;
        return Row(mainAxisSize: MainAxisSize.min, children: [
          if (i > 0) Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: Icon(Icons.chevron_right, size: 16, color: Constants.textLightColor)),
          GestureDetector(onTap: last ? null : () => _navigateTo(_crumbPath(i)), child: Text(i == 0 ? '/' : crumbs[i], style: TextStyle(fontSize: 13, color: last ? Constants.textPrimaryColor : Constants.primaryColor, fontWeight: last ? FontWeight.w600 : FontWeight.normal))),
        ]);
      }))),
    );
  }

  Widget _buildError() {
    return Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Icon(_fileApiMissing ? Icons.cloud_off : Icons.error_outline, size: 48, color: Constants.textLightColor),
      const SizedBox(height: 16),
      Text(_fileApiMissing ? '文件服务未部署' : '加载失败', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Constants.textPrimaryColor)),
      const SizedBox(height: 8),
      Text(_fileApiMissing
          ? '当前服务器未安装文件管理服务，需要先部署才能浏览文件。\n\n📝 操作步骤：\n1. 复制下方安装指令\n2. 切换到对应服务器的 OpenClaw 对话\n3. 粘贴发送，让 AI 执行安装'
          : (_error ?? '未知错误'),
        style: TextStyle(fontSize: 14, color: Constants.textSecondaryColor), textAlign: TextAlign.center),
      const SizedBox(height: 20),
      if (_fileApiMissing) ...[
        Container(
          width: double.infinity, padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: const Color(0xFFF8F6F0), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE0D8C8))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Row(children: [Icon(Icons.terminal, size: 18, color: Color(0xFF667eea)), SizedBox(width: 8), Text('安装指令', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14))]),
            const SizedBox(height: 4),
            const Text('复制后发给 OpenClaw 执行：', style: TextStyle(fontSize: 12, color: Colors.grey)),
            const SizedBox(height: 8),
            Container(
              width: double.infinity, padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: const Color(0xFF1A1A2E), borderRadius: BorderRadius.circular(8)),
              child: Text(_installScript, style: const TextStyle(fontSize: 9, color: Color(0xFF1AFF96), fontFamily: 'monospace'), maxLines: 8, overflow: TextOverflow.ellipsis),
            ),
            const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: _installScript));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('✅ 已复制安装指令！发给 OpenClaw 即可安装'), backgroundColor: Color(0xFF667eea), duration: Duration(seconds: 3)),
              );
            },
            icon: const Icon(Icons.copy, size: 16), label: const Text('📋 复制安装指令'),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF667eea), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 10), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
          ),
        ),
          ]),
        ),
      ] else ...[
        ElevatedButton(onPressed: _loadFiles, style: ElevatedButton.styleFrom(backgroundColor: Constants.primaryColor, foregroundColor: Colors.white), child: const Text('重试')),
      ],
    ])));
  }

  Widget _buildList() {
    return RefreshIndicator(onRefresh: _loadFiles, child: ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 4),
      itemCount: _files.length + (_currentPath != '/' ? 1 : 0),
      itemBuilder: (_, i) {
        if (_currentPath != '/' && i == 0) return ListTile(leading: const Icon(Icons.folder, color: Colors.grey, size: 28), title: const Text('..', style: TextStyle(color: Constants.textSecondaryColor, fontWeight: FontWeight.w500)), subtitle: const Text('返回上级目录'), onTap: _goUp);
        final f = _files[_currentPath != '/' ? i - 1 : i];
        return _buildItem(f);
      },
    ));
  }

  Widget _buildItem(Map<String, dynamic> f) {
    final name = f['name'] ?? '未知', fpath = f['path'] ?? '', isDir = f['isDir'] == true;
    final size = f['size'], owner = f['owner'] ?? '', date = f['date'] ?? '', perms = f['perms'] ?? '';
    return ListTile(
      leading: Icon(isDir ? Icons.folder : _icon(name), color: isDir ? const Color(0xFFE8A838) : const Color(0xFF78909C), size: 28),
      title: Text(name, style: const TextStyle(fontSize: 14, color: Constants.textPrimaryColor)),
      subtitle: Text(_sub(isDir, size, owner, perms, date), style: TextStyle(fontSize: 12, color: Constants.textLightColor, fontFamily: isDir ? null : 'monospace')),
      trailing: Icon(isDir ? Icons.chevron_right : null, color: Constants.textLightColor, size: 20),
      onTap: () { if (isDir) _navigateTo(fpath); else Navigator.push(context, MaterialPageRoute(builder: (_) => FileViewerPage(filePath: fpath, fileName: name))); },
    );
  }

  String _sub(bool isDir, dynamic sz, String ow, String pm, String dt) {
    if (isDir) return '目录';
    final p = <String>[];
    if (sz != null) p.add(_fmtSz(sz is int ? sz : int.tryParse(sz.toString()) ?? 0));
    if (ow.isNotEmpty) p.add(ow);
    if (dt.isNotEmpty) p.add(dt);
    return p.join(' · ');
  }

  IconData _icon(String n) {
    final e = n.contains('.') ? n.split('.').last.toLowerCase() : '';
    return const {'dart': Icons.code, 'js': Icons.code, 'ts': Icons.code, 'py': Icons.code, 'go': Icons.code, 'java': Icons.code, 'sh': Icons.code, 'bash': Icons.code, 'json': Icons.settings_outlined, 'yaml': Icons.settings_outlined, 'yml': Icons.settings_outlined, 'xml': Icons.settings_outlined, 'md': Icons.description_outlined, 'txt': Icons.description_outlined, 'log': Icons.description_outlined, 'jpg': Icons.image_outlined, 'png': Icons.image_outlined, 'svg': Icons.image_outlined, 'mp4': Icons.movie_outlined, 'mp3': Icons.audio_file_outlined, 'zip': Icons.folder_zip_outlined, 'pdf': Icons.picture_as_pdf_outlined}[e] ?? Icons.insert_drive_file_outlined;
  }

  String _fmtSz(int b) {
    if (b < 1024) return '$b B';
    if (b < 1048576) return '${(b / 1024).toStringAsFixed(1)} KB';
    if (b < 1073741824) return '${(b / 1048576).toStringAsFixed(1)} MB';
    return '${(b / 1073741824).toStringAsFixed(1)} GB';
  }
}
