"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateOneFileDataArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataCreateInput_1 = require("../../../inputs/FileDataCreateInput");
let CreateOneFileDataArgs = class CreateOneFileDataArgs {
};
exports.CreateOneFileDataArgs = CreateOneFileDataArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataCreateInput_1.FileDataCreateInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataCreateInput_1.FileDataCreateInput)
], CreateOneFileDataArgs.prototype, "data", void 0);
exports.CreateOneFileDataArgs = CreateOneFileDataArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], CreateOneFileDataArgs);
