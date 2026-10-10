// pages/index/index.js
// 吊牌扫码录入 - 微信小程序版

Page({
  data: {
    // 统计
    total: 0,
    totalValue: 0,
    styleCount: 0,

    // 扫码状态
    scanning: false,
    continuous: false,
    autoSave: false,

    // 结果卡片
    showResult: false,
    pendingBarcode: '',
    pendingStyle: '',
    pendingColorCode: '',
    pendingColor: '',
    pendingSize: '',
    pendingName: '',
    pendingPrice: '',
    isKnownStyle: false,
    isKnownColor: false,

    // 列表数据
    records: [],
    styleList: [],
    colorList: [],

    // 内部缓存
    _records: {},
    _styleDict: {},
    _colorDict: {},
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    // 页面重新显示时刷新（如从后台切回）
    this.loadData()
  },

  onShareAppMessage() {
    return {
      title: '吊牌扫码录入 - 批量录入神器',
      path: '/pages/index/index'
    }
  },

  // ===== 数据加载与渲染 =====
  loadData() {
    const records = wx.getStorageSync('tag_records') || {}
    const styleDict = wx.getStorageSync('tag_style_dict') || {}
    const colorDict = wx.getStorageSync('tag_color_dict') || {}

    this.data._records = records
    this.data._styleDict = styleDict
    this.data._colorDict = colorDict

    this.renderAll()
  },

  renderAll() {
    const records = this.data._records
    const styleDict = this.data._styleDict
    const colorDict = this.data._colorDict

    // 记录列表（按时间倒序）
    const recordList = Object.entries(records)
      .map(([id, r]) => ({ ...r, id }))
      .sort((a, b) => b.time - a.time)

    // 统计
    const total = recordList.length
    const totalValue = recordList.reduce((sum, r) => sum + (r.price || 0), 0)
    const styleCount = Object.keys(styleDict).length

    // 款号字典 → 数组
    const styleList = Object.entries(styleDict).map(([key, val]) => ({
      key,
      name: val.name || '',
      price: val.price || ''
    }))

    // 颜色字典 → 数组
    const colorList = Object.entries(colorDict).map(([key, name]) => ({
      key,
      name: name || ''
    }))

    this.setData({
      total,
      totalValue: totalValue.toFixed(0),
      styleCount,
      records: recordList,
      styleList,
      colorList,
    })
  },

  // ===== 条码解析 =====
  // 规则：最后1位是尺码（字母），往前3位是颜色码（数字），前面是款号
  parseBarcode(code) {
    code = code.trim()
    let size = ''
    let colorCode = ''
    let style = code

    const m = code.match(/([A-Za-z]+)$/)
    if (m) {
      size = m[1].toUpperCase()
      const rest = code.slice(0, code.length - size.length)
      const c = rest.match(/(\d{3})$/)
      if (c) {
        colorCode = c[1]
        style = rest.slice(0, rest.length - 3)
      } else {
        style = rest
      }
    }
    return { style, colorCode, size }
  },

  // ===== 扫码 =====
  onScan() {
    if (this.data.scanning) return
    this.setData({ scanning: true })

    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['barCode'],
      success: (res) => {
        const barcode = res.result.trim()
        if (!barcode) {
          this.setData({ scanning: false })
          wx.showToast({ title: '未识别到条码', icon: 'none' })
          return
        }
        // 震动反馈
        wx.vibrateShort({ type: 'medium' })
        this.handleScanResult(barcode)
      },
      fail: () => {
        // 用户取消或识别失败
      },
      complete: () => {
        this.setData({ scanning: false })
      }
    })
  },

  // ===== 扫码结果处理 =====
  handleScanResult(barcode) {
    const { style, colorCode, size } = this.parseBarcode(barcode)
    const styleDict = this.data._styleDict
    const colorDict = this.data._colorDict

    const sd = styleDict[style]
    const isKnownStyle = !!sd
    const isKnownColor = !!colorDict[colorCode]

    const autoName = sd ? (sd.name || '') : ''
    const autoPrice = sd ? String(sd.price || '') : ''
    const autoColor = colorDict[colorCode] || ''

    // 重复检测
    const dup = Object.values(this.data._records).find(r => r.barcode === barcode)
    if (dup) {
      wx.showModal({
        title: '重复条码',
        content: '该条码已录入过：\n' + (dup.name || '') + ' ' + (dup.size || '') + ' ¥' + (dup.price || ''),
        confirmText: '仍要录入',
        cancelText: '跳过',
        success: (res) => {
          if (!res.confirm) return
          this._proceedScanResult(barcode, style, colorCode, size, isKnownStyle, isKnownColor, autoName, autoPrice, autoColor)
        }
      })
      return
    }

    this._proceedScanResult(barcode, style, colorCode, size, isKnownStyle, isKnownColor, autoName, autoPrice, autoColor)
  },

  _proceedScanResult(barcode, style, colorCode, size, isKnownStyle, isKnownColor, autoName, autoPrice, autoColor) {
    // 智能快存：已知款号 → 自动保存
    if (this.data.autoSave && isKnownStyle) {
      this._autoSaveRecord(barcode, style, colorCode, size, autoName, autoPrice, autoColor)
      return
    }

    // 显示结果卡片等待确认
    this.setData({
      showResult: true,
      pendingBarcode: barcode,
      pendingStyle: style,
      pendingColorCode: colorCode,
      pendingColor: autoColor,
      pendingSize: size,
      pendingName: autoName,
      pendingPrice: autoPrice,
      isKnownStyle,
      isKnownColor,
    })
  },

  // 智能快存：直接保存不入卡
  _autoSaveRecord(barcode, style, colorCode, size, name, price, color) {
    const id = 'r_' + Date.now()
    this.data._records[id] = {
      barcode, style, colorCode, color: color || '', size,
      name, price: parseFloat(price) || 0,
      time: Date.now()
    }
    wx.setStorageSync('tag_records', this.data._records)
    this.renderAll()

    wx.showToast({
      title: '已保存 ' + name + ' ' + (size || ''),
      icon: 'none',
      duration: 1000
    })

    // 连续扫码
    if (this.data.continuous) {
      setTimeout(() => this.onScan(), 300)
    }
  },

  // ===== 输入框处理 =====
  onNameInput(e) {
    this.setData({ pendingName: e.detail.value })
  },

  onPriceInput(e) {
    this.setData({ pendingPrice: e.detail.value })
  },

  // ===== 确认保存 =====
  onConfirm() {
    const name = this.data.pendingName.trim()
    const price = parseFloat(this.data.pendingPrice) || 0

    if (!name) {
      wx.showToast({ title: '请输入品名', icon: 'none' })
      return
    }
    if (!price) {
      wx.showToast({ title: '请输入价格', icon: 'none' })
      return
    }

    const p = {
      barcode: this.data.pendingBarcode,
      style: this.data.pendingStyle,
      colorCode: this.data.pendingColorCode,
      size: this.data.pendingSize,
    }

    // 保存记录
    const id = 'r_' + Date.now()
    this.data._records[id] = {
      barcode: p.barcode,
      style: p.style,
      colorCode: p.colorCode,
      color: this.data.pendingColor || '',
      size: p.size,
      name: name,
      price: price,
      time: Date.now()
    }

    // 更新款号字典
    this.data._styleDict[p.style] = { name, price }
    wx.setStorageSync('tag_style_dict', this.data._styleDict)

    // 新颜色码 → 提示输入
    if (p.colorCode && !this.data._colorDict[p.colorCode]) {
      wx.showModal({
        title: '新颜色码：' + p.colorCode,
        editable: true,
        placeholderText: '请输入颜色名称（如：米色/黑色/白色）',
        confirmText: '保存',
        success: (res) => {
          if (res.confirm && res.content) {
            const cn = res.content.trim()
            this.data._colorDict[p.colorCode] = cn
            wx.setStorageSync('tag_color_dict', this.data._colorDict)
            // 更新当前记录的颜色
            this.data._records[id].color = cn
            wx.setStorageSync('tag_records', this.data._records)
          }
          this._afterConfirm()
        }
      })
    } else {
      this._afterConfirm()
    }
  },

  _afterConfirm() {
    wx.setStorageSync('tag_records', this.data._records)
    this.setData({ showResult: false })
    this.renderAll()
    wx.showToast({ title: '已保存', icon: 'success', duration: 800 })

    if (this.data.continuous) {
      setTimeout(() => this.onScan(), 500)
    }
  },

  // ===== 取消 =====
  onCancel() {
    this.setData({
      showResult: false,
      pendingBarcode: '',
      pendingName: '',
      pendingPrice: '',
    })
  },

  // ===== 删除记录 =====
  onDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除确认',
      content: '确认删除这条记录？',
      confirmText: '删除',
      confirmColor: '#e94560',
      success: (res) => {
        if (!res.confirm) return
        delete this.data._records[id]
        wx.setStorageSync('tag_records', this.data._records)
        this.renderAll()
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  },

  // ===== 编辑颜色名称 =====
  onEditColor(e) {
    const code = e.currentTarget.dataset.code
    const current = this.data._colorDict[code] || ''

    wx.showModal({
      title: '颜色码：' + code,
      editable: true,
      placeholderText: '请输入颜色名称',
      content: current,
      confirmText: '保存',
      success: (res) => {
        if (res.confirm && res.content) {
          const cn = res.content.trim()
          this.data._colorDict[code] = cn
          wx.setStorageSync('tag_color_dict', this.data._colorDict)
          // 同步更新已有记录中的颜色名
          Object.values(this.data._records).forEach(r => {
            if (r.colorCode === code) r.color = cn
          })
          wx.setStorageSync('tag_records', this.data._records)
          this.renderAll()
          wx.showToast({ title: '已更新', icon: 'success' })
        }
      }
    })
  },

  // ===== 模式开关 =====
  onToggleContinuous(e) {
    this.setData({ continuous: e.detail.value })
    if (e.detail.value) {
      wx.showToast({ title: '已开启连续扫码', icon: 'none', duration: 1000 })
    }
  },

  onToggleAutoSave(e) {
    this.setData({ autoSave: e.detail.value })
    if (e.detail.value) {
      wx.showToast({ title: '已开启智能快存', icon: 'none', duration: 1000 })
    }
  },

  // ===== 清空记录 =====
  onClear() {
    if (this.data.total === 0) {
      wx.showToast({ title: '没有记录可清空', icon: 'none' })
      return
    }
    wx.showModal({
      title: '清空确认',
      content: '确认清空全部 ' + this.data.total + ' 条记录？\n（款号字典和颜色字典会保留）',
      confirmText: '清空',
      confirmColor: '#e94560',
      success: (res) => {
        if (!res.confirm) return
        this.data._records = {}
        wx.setStorageSync('tag_records', this.data._records)
        this.renderAll()
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  },

  // ===== 导出 Excel =====
  onExport() {
    const list = Object.values(this.data._records).sort((a, b) => a.time - b.time)
    if (list.length === 0) {
      wx.showToast({ title: '没有记录可导出', icon: 'none' })
      return
    }

    wx.showLoading({ title: '生成Excel...' })

    // 用 HTML 表格格式生成 .xls 文件（Excel/WPS 直接可打开）
    let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">'
    html += '<head><meta charset="UTF-8"><style>td{border:1px solid #ccc;padding:4px 8px;font-size:12pt}</style></head><body><table>'
    html += '<tr><td>序号</td><td>品名</td><td>款号</td><td>颜色</td><td>尺码</td><td>价格(RMB)</td><td>条形码</td></tr>'

    list.forEach((r, i) => {
      const colorText = r.color ? (r.colorCode + ' ' + r.color) : (r.colorCode || '')
      html += '<tr>'
      html += '<td>' + (i + 1) + '</td>'
      html += '<td>' + (r.name || '') + '</td>'
      html += '<td>' + (r.style || '') + '</td>'
      html += '<td>' + colorText + '</td>'
      html += '<td>' + (r.size || '') + '</td>'
      html += '<td>' + (r.price || 0) + '</td>'
      html += '<td>' + (r.barcode || '') + '</td>'
      html += '</tr>'
    })
    html += '</table></body></html>'

    const d = new Date()
    const fname = '吊牌汇总_' + d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') + '.xls'
    const filePath = wx.env.USER_DATA_PATH + '/' + fname

    const fs = wx.getFileSystemManager()
    fs.writeFile({
      filePath: filePath,
      data: html,
      encoding: 'utf8',
      success: () => {
        wx.hideLoading()
        wx.openDocument({
          filePath: filePath,
          showMenu: true,
          fileType: 'xls',
          success: () => {
            wx.showToast({ title: '已生成Excel', icon: 'success' })
          },
          fail: () => {
            // openDocument 失败 → 尝试分享到聊天
            wx.shareFileMessage({
              filePath: filePath,
              fileName: fname,
              success: () => {
                wx.showToast({ title: '已分享文件', icon: 'success' })
              },
              fail: () => {
                // 最后兜底：复制到剪贴板
                wx.setClipboardData({
                  data: html,
                  success: () => {
                    wx.showToast({ title: '内容已复制到剪贴板', icon: 'none' })
                  }
                })
              }
            })
          }
        })
      },
      fail: (err) => {
        wx.hideLoading()
        wx.showToast({ title: '导出失败', icon: 'none' })
        console.error('writeFile fail:', err)
      }
    })
  }
})
