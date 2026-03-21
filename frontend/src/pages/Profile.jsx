import React from 'react';
import { Avatar } from 'antd';
import avatarImg from '../assets/MainAvatar.png';
import {
  UserOutlined, CalendarOutlined, IdcardOutlined,
  TeamOutlined, FilePdfOutlined, ApiOutlined,
  GithubOutlined, BuildOutlined,
} from '@ant-design/icons';
import './Profile.scss';

const fields = [
  { icon: <UserOutlined />,     label: 'HỌ VÀ TÊN',         value: 'Phùng Anh Văn' },
  { icon: <CalendarOutlined />, label: 'NGÀY THÁNG NĂM SINH', value: '13/12/2004' },
  { icon: <IdcardOutlined />,   label: 'MÃ SINH VIÊN',       value: 'B22DCPT302' },
  { icon: <TeamOutlined />,     label: 'CPA TÍCH LŨY',       value: '3.26' },
];

const links = [
  { icon: <FilePdfOutlined />, label: 'Báo cáo PDF',    href: '#' },
  { icon: <ApiOutlined />,     label: 'API Docs',        href: 'http://localhost:5000/api/health' },
  { icon: <GithubOutlined />,  label: 'GitHub',          href: '#' },
  { icon: <BuildOutlined />,   label: 'Figma / Draw.io', href: '#' },
];

export default function Profile() {
  return (
    <div className="profile-root">
      <div className="page-header" style={{ flexShrink: 0, padding: '16px 20px 0' }}>
        <div>
          <h1 className="page-title">User Profile</h1>
          <p className="page-subtitle">Manage your personal details</p>
        </div>
        <div className="page-time">
          {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}<br />
          <span style={{ fontSize: 11 }}>{new Date().toDateString()}</span>
        </div>
      </div>

      <div className="profile-card-wrap">
        <div className="profile-card">
          {/* Avatar side */}
          <div className="profile-avatar-col">
            {/* <Avatar size={110} src="../../public/MainAvatar.png" className="profile-avatar" /> */}
            <img src={avatarImg} alt="Main Avatar" style={{ width: 150, height: 200, borderRadius: '50%', objectFit: 'cover' }} />
            <div className="profile-role-badge">Web Developer</div>
          </div>

          {/* Fields */}
          <div className="profile-fields">
            {fields.map(f => (
              <div key={f.label} className="pf-field">
                <div className="pf-label">{f.label}</div>
                <div className="pf-input">
                  <span className="pf-icon">{f.icon}</span>
                  <span className="pf-value">{f.value}</span>
                </div>
              </div>
            ))}

            {/* Links section */}
            <div className="pf-label" style={{ marginTop: 16 }}>TÀI LIỆU &amp; LIÊN KẾT</div>
            <div className="pf-links-grid">
              {links.map(l => (
                <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="pf-link-card">
                  <span className="pf-link-icon">{l.icon}</span>
                  <span>{l.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
