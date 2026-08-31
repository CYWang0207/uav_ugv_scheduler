# 基于 ZRDDS 的 LLM 多智能体无人机无人车任务调度

这是一个可运行的 ZRDDS C++ 沙盘仿真：任务规划智能体发布校园应急事件，无人机先执行热成像勘测，协调智能体依据候选报价分配任务；勘测完成后，无人车才接收医疗物资投送任务。浏览器页面通过 Dashboard Bridge 生成的遥测快照展示全部过程。

该工程演示 DDS 数据面和调度算法，不连接真实飞控、车辆底盘或外部 LLM 服务。

## 架构

```
StructuredPlanner --TaskRequest--> CoordinateService --CoordinateTransform-->
        |                                                                  |
        +--------------> UAV / UGV --CandidateBid--> Coordinator --------+
                                                   --TaskAssignment---> UAV / UGV
UAV / UGV --VehicleState, ExecutionEvent--> DashboardBridge --> telemetry.json --> Browser
```

- `StructuredPlanner`：生产已校验的结构化任务意图。生产场景中，LLM 输出必须先经过 JSON Schema/业务校验，再映射到 `TaskRequest`；自然语言不是 DDS 业务协议。
- `CoordinateService`：使用固定校园原点把 WGS84 经纬高转换为 ENU 米制坐标，并把 ENU 投影到 640 x 440 沙盘像素。
- `VehicleAgent`：分别模拟 UAV 与 UGV 的能力上报、报价、任务接收和执行状态。
- `Coordinator`：唯一的 `TaskAssignment` Writer。只选择能力匹配且有效的候选报价，排序规则为最低成本、其次最短 ETA、最后 bid ID；前序任务未完成的任务不参与分配。
- `DashboardBridge`：DDS Reader，汇总 Topics 后写出浏览器可读的 `dashboard/telemetry.json`。浏览器不直接访问 DDS。

## DDS 契约与 QoS

IDL 位于 [idl/mission.idl](idl/mission.idl)，QoS 说明位于 [config/qos.yaml](config/qos.yaml)。

| Topic | 载荷 | QoS |
| --- | --- | --- |
| `Mission.TaskRequest` | 任务、优先级、能力、WGS84/ENU 目标、依赖 | Reliable + Transient Local |
| `Mission.VehicleCapability` | 设备种类、能力、速度、续航和可用性 | Reliable + Transient Local |
| `Mission.CandidateBid` | 可行性、ETA、成本、有效期 | Reliable + Volatile |
| `Mission.TaskAssignment` | 获选设备、报价、epoch、dispatcher boot ID | Reliable + Transient Local |
| `Mission.VehicleState` | 位置、执行阶段、电量、进度 | Reliable + Transient Local |
| `Mission.ExecutionEvent` | 审计事件与事件时间 | Reliable + Transient Local |
| `Mission.CoordinateTransform` | WGS84、ENU、沙盘像素及地图版本 | Best Effort + Volatile |

`Transient Local` 只能向同一运行期间的晚加入 Reader 重放 Writer 留存的样本，不能替代跨进程重启的数据库或事件记录服务。

## 坐标约定

- 输入：WGS84，`latitude_deg`、`longitude_deg`、`altitude_m`。
- 任务空间：`park_enu_v1` / `CAMPUS_LOCAL`，东、北、天（ENU），单位米。
- 沙盘：原点左上，`x = 80 + 2.8 * east`，`y = 440 - 2.8 * north`，单位像素。
- `frame_id` 与 `map_version` 随任务、设备状态和转换结果发送，避免不同地图版本或坐标系混用。

## 运行

在 PowerShell 中进入工程目录：

```powershell
cd D:\ZRDDS\ZRDDS-2.5.0\uav_ugv_scheduler
.\scripts\build.ps1 -Configuration Debug
.\scripts\run_demo.ps1
python .\tests\verify_telemetry.py
.\scripts\serve_dashboard.ps1 -Port 8765
```

打开 `http://localhost:8765` 查看沙盘。`run_demo.ps1` 会设置临时 `ZRDDS_HOME`，使运行时从 SDK 根目录找到 `zrddslicence.lic`，并在退出后恢复原环境变量。

## 验收场景

事件 `INC-2026-001` 包含两个关键任务：

1. `INC-2026-001-SURVEY`：UAV `uav-alpha` 以 `CAMERA_THERMAL` 能力进行热成像勘测。
2. `INC-2026-001-DELIVERY`：UGV `ugv-bravo` 以 `MEDICAL_PAYLOAD` 能力投送物资，前提是勘测任务已完成。

`tests/verify_telemetry.py` 验证任务数量、设备分配、完成状态、关键事件及依赖时间顺序。它验证的是此次沙盘运行生成的 DDS 桥接快照，而非真实设备的安全或飞行认证。
