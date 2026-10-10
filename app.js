App({
  onLaunch() {
    // 初始化示例数据（仅首次使用）
    const records = wx.getStorageSync('tag_records') || {}
    if (Object.keys(records).length === 0 && !wx.getStorageSync('tag_init')) {
      const demoKey = 'demo1'
      const demoRecord = {
        barcode: '2608SL3130130M',
        style: '2608SL3130',
        colorCode: '130',
        color: '米色',
        size: 'M',
        name: '翻领金属丝外套',
        price: 1698,
        time: Date.now()
      }
      wx.setStorageSync('tag_records', { [demoKey]: demoRecord })
      wx.setStorageSync('tag_style_dict', { '2608SL3130': { name: '翻领金属丝外套', price: 1698 } })
      wx.setStorageSync('tag_color_dict', { '130': '米色' })
      wx.setStorageSync('tag_init', '1')
    }
  }
})
