import React, {useEffect, useMemo, useState} from "react";
import {Button, Space, Tag, theme} from "antd";
import G6, {Graph, GraphData, ModelConfig} from "@antv/g6";
import {
  Download,
  FitScreen,
  NavigateBefore, NavigateNext,
  OneXMobiledata,
  Timer,
  ZoomIn,
  ZoomOut
} from "@styled-icons/material-outlined";
import {SyncOutlined} from '@ant-design/icons';
import {DashboardPanel, graphDataLoader, judge} from "../../utils";
import {InfoWrapper, ViewControl} from "./style";

const NodeGraph: React.FC<DashboardPanel> = (
  {
    gridPos: {
      w, h
    },
    panelOptions: {
      datasource,
      title,
      type
    },
    nodeOptions: {
      key = 'name',
      rules
    },
  }
) => {
  console.log('NodeGraph() called');
  const ref = React.useRef<HTMLDivElement>(null);
  const {token, theme: {id: isDark}} = theme.useToken();

  const graph = React.useRef<Graph | null>(null);
  const startTime = React.useRef<number>(0);
  const [timeUsage, setTimeUsage] = useState<number>(-1);
  const [time, setTime] = useState<number>(1);
  const [timeRestriction, setTimeRestriction] = useState(Infinity);

  const [defaultNodeModel, defaultEdgeModel]: [ModelConfig, ModelConfig] = [
    {
      size: 10,
      style: {
        fill: token.colorInfoBg,
        stroke: token.colorInfoBorderHover
      }
    },
    {
      style: {
        stroke: token.colorBorder
      }
    }
  ];

  function applyRules() {
    const nodes = graph.current?.getNodes();
    nodes?.forEach(node => {
      let set: boolean = false;

      rules.forEach(rule => {
        if (rule?.fieldName === key) {
          // field name is id
          if (judge(rule.type, node.getID(), rule.value)) {
            console.log(node)
            set = true;
            node.update({
              ...defaultNodeModel,
              style: {
                ...defaultNodeModel.style,
                fill: rule.config.lColor,
                stroke: rule.config.lStroke
              }
            });
          }
        } else {

        }
      });

      if (!set) {
        node.update({...defaultNodeModel});
      }
    });
    graph.current?.getEdges().forEach(edge => {
      edge.update({...defaultEdgeModel});
    });
  }

  useEffect(() => {
    graph.current?.changeSize(ref.current?.clientWidth ?? 0, ref.current?.clientHeight ?? 0);
  }, [w, h]);

  useEffect(applyRules, [defaultNodeModel, defaultEdgeModel, key, rules]);

  useEffect(() => {
    if (!graph.current) {
      graph.current = new G6.Graph({
        container: ref.current as HTMLDivElement,
        width: ref.current?.clientWidth,
        height: ref.current?.clientHeight,
        layout: {
          type: 'force',
          // type: 'restricted-force-layout',
          linkDistance: 10,
          nodeStrength: -30,
          preventOverlap: true,
          nodeSize: 6,
          enableTick: true,
          alphaDecay: 0.028,
          alphaMin: 0.001,
          alpha: 0.3,
          onLayoutEnd: () => {
            setTimeUsage(Date.now() - startTime.current);
          }
        },
        modes: {
          default: ['zoom-canvas', 'drag-canvas']
        },
      });
    }

    graphDataLoader.getData(datasource).then(value => {
      setTimeRestriction(value.nodes.reduce((max, node) => {
        if (max < node.end) {
          max = node.end;
        }
        return max;
      }, -1));
      const processedData: GraphData = {
        nodes: value.nodes.filter(node => {
          return (node.start ?? -1) <= time && (node.end ?? Infinity) >= time;
        }).map(node => ({
          ...node,
          id: node[key] as string,
        })),
        edges: value.links.filter(link => {
          return (link.start ?? -1) <= time && (link.end ?? Infinity) >= time;
        }).map(link => ({
          ...link,
          id: link.id.toString(),
          source: link.source.toString(),
          target: link.target.toString(),
        }))
      };
      console.log(processedData)

      graph.current?.data(processedData);

      startTime.current = Date.now();
      setTimeUsage(-1);

      graph.current?.render();
      applyRules();
      graph.current?.changeSize(ref.current?.clientWidth ?? 0, ref.current?.clientHeight ?? 0);
    });
  }, [key, datasource, time]);

  return (
    <div ref={ref} style={{height: '100%'}}>
      <ViewControl>
        <InfoWrapper>
          {timeUsage === -1 ?
            <Tag icon={<SyncOutlined spin/>} color="processing">
              rendering
            </Tag> :
            <Tag icon={<Timer size={16}/>} color="success">
              {timeUsage} ms
            </Tag>}
        </InfoWrapper>
        <Space wrap>
          <Button
            size="small"
            type="text"
            icon={<ZoomIn size={18}/>}
            onClick={() => {
              graph.current?.zoom(1.1, graph.current?.getGraphCenterPoint());
            }}
          />
          <Button
            size="small"
            type="text"
            icon={<ZoomOut size={18}/>}
            onClick={() => {
              graph.current?.zoom(0.9, graph.current?.getGraphCenterPoint());
            }}
          />
          <Button
            size="small"
            type="text"
            icon={<FitScreen size={18}/>}
            onClick={() => {
              graph.current?.fitView();
            }}
          />
          <Button
            size="small"
            type="text"
            icon={<OneXMobiledata size={18}/>}
            onClick={() => {
              graph.current?.zoomTo(1, graph.current?.getGraphCenterPoint());
            }}
          />
          <Button
            size="small"
            type="text"
            icon={<Download size={18}/>}
            onClick={() => {
              graph.current?.downloadFullImage();
            }}
          />
          <Button
            size="small"
            type="text"
            disabled={time <= 1}
            icon={<NavigateBefore size={18}/>}
            onClick={() => {
              setTime(time - 1);
            }}
          />
          <Button
            size="small"
            type="text"
            disabled={time >= timeRestriction}
            icon={<NavigateNext size={18}/>}
            onClick={() => {
              setTime(time + 1);
            }}
          />
        </Space>
      </ViewControl>
    </div>
  )
}

function areEqual(prevProps: DashboardPanel, nextProps: DashboardPanel) {
  let equal = prevProps.panelOptions.datasource === nextProps.panelOptions.datasource
    && prevProps.nodeOptions.key === nextProps.nodeOptions.key
    && prevProps.gridPos.h === nextProps.gridPos.h
    && prevProps.gridPos.w === nextProps.gridPos.w;
  return false;
}

export default React.memo(NodeGraph, areEqual);
