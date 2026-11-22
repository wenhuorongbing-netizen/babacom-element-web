/*
Copyright 2024 New Vector Ltd.
Copyright 2021 Šimon Brandner <simon.bra.ag@gmail.com>

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import classNames from "classnames";
import { logger } from "matrix-js-sdk/src/logger";

import { _t, _td } from "../../../languageHandler";
import BaseDialog from "..//dialogs/BaseDialog";
import DialogButtons from "./DialogButtons";
import AccessibleButton from "./AccessibleButton";
import TabbedView, { Tab, TabLocation } from "../../structures/TabbedView";
import PlatformPeg from "../../../PlatformPeg";
import { type NonEmptyArray } from "../../../@types/common";
import StyledCheckbox from "./StyledCheckbox";

export function getDesktopCapturerSources(): Promise<Array<DesktopCapturerSource>> {
    const options: GetSourcesOptions = {
        thumbnailSize: {
            height: 176,
            width: 312,
        },
        types: ["screen", "window"],
    };
    const plaf = PlatformPeg.get();
    return plaf ? plaf?.getDesktopCapturerSources(options) : Promise.resolve<DesktopCapturerSource[]>([]);
}

export enum Tabs {
    Screens = "screen",
    Windows = "window",
}

export interface ExistingSourceIProps {
    source: DesktopCapturerSource;
    onSelect(source: DesktopCapturerSource): void;
    selected: boolean;
}

export class ExistingSource extends React.Component<ExistingSourceIProps> {
    private onClick = (): void => {
        this.props.onSelect(this.props.source);
    };

    public render(): React.ReactNode {
        const thumbnailClasses = classNames({
            mx_desktopCapturerSourcePicker_source_thumbnail: true,
            mx_desktopCapturerSourcePicker_source_thumbnail_selected: this.props.selected,
        });

        return (
            <AccessibleButton
                className="mx_desktopCapturerSourcePicker_source"
                title={this.props.source.name}
                onClick={this.onClick}
            >
                <img alt={this.props.source.name} className={thumbnailClasses} src={this.props.source.thumbnailURL} />
                <span className="mx_desktopCapturerSourcePicker_source_name">{this.props.source.name}</span>
            </AccessibleButton>
        );
    }
}

export interface PickerIState {
    selectedTab: Tabs;
    sources: Array<DesktopCapturerSource>;
    selectedSource?: DesktopCapturerSource;
    shareSystemAudio: boolean;
}
export interface PickerIProps {
    /** Whether the main process can offer system audio for this request. */
    canShareSystemAudio?: boolean;
    elementCallRoomName?: string;
    onFinished(source?: DesktopCapturerSource, shareSystemAudio?: boolean): void;
}

export default class DesktopCapturerSourcePicker extends React.Component<PickerIProps, PickerIState> {
    private stopSourceRefresh?: () => void;

    public constructor(props: PickerIProps) {
        super(props);

        this.state = {
            selectedTab: Tabs.Screens,
            sources: [],
            shareSystemAudio: false,
        };
    }

    public componentDidMount(): void {
        let stopped = false;
        let timeout: number | undefined;

        const refreshSources = async (): Promise<void> => {
            let sources: DesktopCapturerSource[] | undefined;
            try {
                sources = await getDesktopCapturerSources();
            } catch (error) {
                if (!stopped) logger.warn("Failed to refresh desktop capture sources", error);
            }

            if (stopped) return;

            // Wait for enumeration to settle before scheduling the next thumbnail refresh.
            timeout = window.setTimeout(() => void refreshSources(), 500);
            if (sources) {
                this.setState(({ selectedSource }) => ({
                    sources,
                    selectedSource: sources.find((source) => source.id === selectedSource?.id),
                }));
            }
        };

        this.stopSourceRefresh = () => {
            stopped = true;
            window.clearTimeout(timeout);
        };
        void refreshSources();
    }

    public componentWillUnmount(): void {
        this.stopSourceRefresh?.();
    }

    private onSelect = (source: DesktopCapturerSource): void => {
        this.setState({ selectedSource: source });
    };

    private onShare = (): void => {
        this.props.onFinished(
            this.state.selectedSource,
            this.props.canShareSystemAudio === true && this.state.shareSystemAudio,
        );
    };

    private onTabChange = (tab: Tabs): void => {
        this.setState({ selectedSource: undefined, selectedTab: tab });
    };

    private onCloseClick = (): void => {
        this.props.onFinished();
    };

    private getTab(type: Tabs, label: TranslationKey): Tab<Tabs> {
        const sources = this.state.sources
            .filter((source) => source.id.startsWith(type))
            .map((source) => {
                return (
                    <ExistingSource
                        selected={this.state.selectedSource?.id === source.id}
                        source={source}
                        onSelect={this.onSelect}
                        key={source.id}
                    />
                );
            });

        return new Tab(type, label, null, <div className="mx_desktopCapturerSourcePicker_tab">{sources}</div>);
    }

    public render(): React.ReactNode {
        const tabs: NonEmptyArray<Tab<Tabs>> = [
            this.getTab(Tabs.Screens, _td("voip|screenshare_monitor")),
            this.getTab(Tabs.Windows, _td("voip|screenshare_window")),
        ];
        const { elementCallRoomName } = this.props;

        return (
            <BaseDialog
                className="mx_desktopCapturerSourcePicker"
                onFinished={this.onCloseClick}
                title={_t("voip|screenshare_title")}
            >
                {elementCallRoomName !== undefined && (
                    <p>{_t("voip|screenshare_destination", { roomName: elementCallRoomName })}</p>
                )}
                <TabbedView
                    tabs={tabs}
                    tabLocation={TabLocation.TOP}
                    activeTabId={this.state.selectedTab}
                    onChange={this.onTabChange}
                />
                {elementCallRoomName !== undefined && this.state.selectedSource && (
                    <p role="status">{_t("voip|screenshare_selected_source", { sourceName: this.state.selectedSource.name })}</p>
                )}
                {this.props.canShareSystemAudio === true && (
                    <StyledCheckbox
                        checked={this.state.shareSystemAudio}
                        onChange={(event) => this.setState({ shareSystemAudio: event.target.checked })}
                    >
                        {_t("voip|screenshare_system_audio")}
                    </StyledCheckbox>
                )}
                <DialogButtons
                    primaryButton={elementCallRoomName !== undefined ? _t("voip|screenshare_confirm") : _t("action|share")}
                    hasCancel={true}
                    onCancel={this.onCloseClick}
                    onPrimaryButtonClick={this.onShare}
                    primaryDisabled={!this.state.selectedSource}
                />
            </BaseDialog>
        );
    }
}
